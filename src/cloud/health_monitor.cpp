#include "health_monitor.h"
#include "supabase_config.h"
#include "wifi_manager.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

// ========== STATIC STATE ==========
static DeviceHealth health = {};
static String deviceId;
static uint32_t lastCloudSyncMs = 0;
static uint32_t bootTimeMs = 0;

// Cloud sync interval (every 60 seconds or on error)
static const uint32_t CLOUD_SYNC_INTERVAL_MS = 60000;

// ========== HELPER FUNCTIONS ==========

static String getCurrentTimestamp() {
    time_t now = time(nullptr);
    struct tm t;
    localtime_r(&now, &t);
    
    char buf[30];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
             t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
             t.tm_hour, t.tm_min, t.tm_sec);
    return String(buf);
}

// ========== PUBLIC IMPLEMENTATION ==========

void HealthMonitor::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    
    bootTimeMs = millis();
    lastCloudSyncMs = 0;
    
    // Initialize health struct
    health = {};
    health.rfidHealthy = true;
    health.wifiConnected = false;
    health.ntpSynced = false;
    
    Serial.println("[HEALTH] Monitor initialized for device: " + deviceId);
}

void HealthMonitor::update() {
    // Update system health metrics
    health.uptimeSeconds = (millis() - bootTimeMs) / 1000;
    health.freeHeapBytes = ESP.getFreeHeap();
    health.wifiConnected = WiFi.status() == WL_CONNECTED;
    health.wifiRssi = WiFi.RSSI();
    health.ntpSynced = WiFiManager::isTimeValid();
    
    // Periodic cloud sync
    uint32_t now = millis();
    if (now - lastCloudSyncMs >= CLOUD_SYNC_INTERVAL_MS) {
        lastCloudSyncMs = now;
        pushHealthToSupabase();
    }
}

void HealthMonitor::reportRfidOk() {
    health.lastSuccessfulReadMs = millis();
    health.lastSuccessfulReadTime = getCurrentTimestamp();
    health.rfidHealthy = true;
}

void HealthMonitor::reportRfidError(const char* error) {
    health.lastRfidError = String(error);
    health.lastRfidErrorTime = getCurrentTimestamp();
    health.rfidHealthy = false;
    
    Serial.printf("[HEALTH] RFID Error: %s at %s\n", error, health.lastRfidErrorTime.c_str());
    
    // Immediately sync to cloud on error
    pushHealthToSupabase();
}

void HealthMonitor::reportRfidReinit() {
    health.rfidReinitCount++;
    health.lastRfidError = "Reader reinitialized";
    health.lastRfidErrorTime = getCurrentTimestamp();
    
    Serial.printf("[HEALTH] RFID Reinit #%d at %s\n", 
                  health.rfidReinitCount, health.lastRfidErrorTime.c_str());
    
    // Sync to cloud on reinit
    pushHealthToSupabase();
}

void HealthMonitor::setRfidVersion(byte version) {
    health.rfidVersion = version;
}

void HealthMonitor::setRfidHealthy(bool healthy) {
    health.rfidHealthy = healthy;
}

void HealthMonitor::reportRfidSoftReset() {
    health.rfidSoftResetCount++;
    Serial.printf("[HEALTH] RFID Soft Reset #%d\n", health.rfidSoftResetCount);
}

void HealthMonitor::reportWifiDisconnect() {
    health.wifiDisconnectCount++;
}

void HealthMonitor::setWifiConnected(bool connected, int8_t rssi) {
    health.wifiConnected = connected;
    health.wifiRssi = rssi;
}

void HealthMonitor::setNtpSynced(bool synced) {
    health.ntpSynced = synced;
}

DeviceHealth HealthMonitor::getHealth() {
    // Update dynamic values
    health.uptimeSeconds = (millis() - bootTimeMs) / 1000;
    health.freeHeapBytes = ESP.getFreeHeap();
    return health;
}

void HealthMonitor::syncToCloud() {
    pushHealthToSupabase();
}

void HealthMonitor::pushHealthToSupabase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HEALTH] Cannot sync - WiFi not connected");
        return;
    }
    
    // Build JSON payload
    String json = "{";
    json += "\"device_id\":\"" + deviceId + "\",";
    json += "\"uptime_seconds\":" + String(health.uptimeSeconds) + ",";
    json += "\"free_heap_bytes\":" + String(health.freeHeapBytes) + ",";
    json += "\"wifi_rssi\":" + String(health.wifiRssi) + ",";
    json += "\"wifi_connected\":" + String(health.wifiConnected ? "true" : "false") + ",";
    json += "\"ntp_synced\":" + String(health.ntpSynced ? "true" : "false") + ",";
    json += "\"rfid_healthy\":" + String(health.rfidHealthy ? "true" : "false") + ",";
    json += "\"rfid_version\":" + String(health.rfidVersion) + ",";
    json += "\"rfid_reinit_count\":" + String(health.rfidReinitCount) + ",";
    json += "\"wifi_disconnect_count\":" + String(health.wifiDisconnectCount) + ",";
    
    // Handle nullable string fields
    if (health.lastRfidError.length() > 0) {
        json += "\"last_rfid_error\":\"" + health.lastRfidError + "\",";
        json += "\"last_rfid_error_time\":\"" + health.lastRfidErrorTime + "\",";
    } else {
        json += "\"last_rfid_error\":null,";
        json += "\"last_rfid_error_time\":null,";
    }
    
    // Soft reset count
    json += "\"rfid_soft_reset_count\":" + String(health.rfidSoftResetCount) + ",";
    
    // Last successful read time
    if (health.lastSuccessfulReadTime.length() > 0) {
        json += "\"last_successful_read_time\":\"" + health.lastSuccessfulReadTime + "\"";
    } else {
        json += "\"last_successful_read_time\":null";
    }
    
    json += "}";
    
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/device_health";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "resolution=merge-duplicates");  // Upsert
    
    int code = http.POST(json);
    http.end();
    
    if (code == 200 || code == 201) {
        Serial.println("[HEALTH] Cloud sync OK");
    } else {
        Serial.printf("[HEALTH] Cloud sync FAILED HTTP %d\n", code);
    }
}
