#include "health_monitor.h"
#include "supabase_config.h"
#include "wifi_manager.h"
#include "../access/rfid_manager.h"
#include "../config/config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <LittleFS.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "../storage/nvs_store.h"
#include "../core/thread_safe.h"

// ==================== STATIC STATE ====================
static DeviceHealth health = {};
static String       deviceId;
static uint32_t     lastCloudSyncMs = 0;
static uint32_t     bootTimeMs      = 0;

static const uint32_t CLOUD_SYNC_INTERVAL_MS = 60000;   // push every 60 s

// ==================== HELPERS ====================

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

static String jsonEscape(const String& s) {
    String out;
    out.reserve(s.length() + 16);
    for (size_t i = 0; i < s.length(); i++) {
        char c = s[i];
        if (c == '"')       out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else                out += c;
    }
    return out;
}

// ==================== COLLECTORS ====================

static void collectRfidHealth() {
    RFIDHealth rh = RFIDManager::getHealth();

    health.rfidCommunicationOk = rh.communicationOk;
    health.rfidSamConfigured   = rh.samConfigured;
    health.rfidIC              = rh.ic;
    health.rfidFirmwareMaj     = rh.firmwareVersionMaj;
    health.rfidFirmwareMin     = rh.firmwareVersionMin;
    health.rfidFirmwareSupport = rh.firmwareSupport;
    health.rfidPollCount       = rh.pollCount;
    health.rfidReinitCount     = rh.reinitCount;

    health.rfidHealthy = rh.communicationOk && rh.samConfigured;

    // Update last-read timestamp when the reader is healthy
    if (rh.communicationOk) {
        health.lastSuccessfulReadTime = getCurrentTimestamp();
    }

    // Record error if communication down
    if (!rh.communicationOk) {
        health.lastRfidError     = "PN532 SPI communication failed";
        health.lastRfidErrorTime = getCurrentTimestamp();
    } else if (!rh.samConfigured) {
        health.lastRfidError     = "PN532 SAM not configured";
        health.lastRfidErrorTime = getCurrentTimestamp();
    }
}

static void collectSystemHealth() {
    health.uptimeSeconds         = (millis() - bootTimeMs) / 1000;
    health.freeHeapBytes         = ESP.getFreeHeap();
    health.totalHeapBytes        = ESP.getHeapSize();
    health.minFreeHeapBytes      = ESP.getMinFreeHeap();
    health.largestFreeBlockBytes = ESP.getMaxAllocHeap();
}

static void collectWifiHealth() {
    health.wifiConnected = WiFi.status() == WL_CONNECTED;
    health.wifiRssi      = WiFi.RSSI();
    health.ntpSynced     = WiFiManager::isTimeValid();
}

static void collectProcessorInfo() {
    health.cpuFreqMhz = ESP.getCpuFreqMHz();

    const char* m = ESP.getChipModel();
    if      (strstr(m, "ESP32-S3")) health.chipModel = 5;
    else if (strstr(m, "ESP32-C3")) health.chipModel = 9;
    else if (strstr(m, "ESP32-S2")) health.chipModel = 2;
    else                            health.chipModel = 0;

    health.chipRevision = ESP.getChipRevision();
    health.chipCores    = ESP.getChipCores();
}

static void collectCoreStatus() {
    uint8_t currentCore       = xPortGetCoreID();
    TaskHandle_t currentTask  = xTaskGetCurrentTaskHandle();

    if (!currentTask) {
        strcpy(health.core0CurrentTask, "N/A");
        strcpy(health.core1CurrentTask, "N/A");
        return;
    }

    const char* name = pcTaskGetName(currentTask);
    UBaseType_t hw   = uxTaskGetStackHighWaterMark(currentTask);
    uint32_t    free = hw * sizeof(StackType_t);

    if (currentCore == 0) {
        health.core0IsIdle = false;
        strncpy(health.core0CurrentTask, name ? name : "unknown",
                sizeof(health.core0CurrentTask) - 1);
        health.core0FreeStackBytes = free;
        // Core 1 approximation
        health.core1IsIdle = false;
        strcpy(health.core1CurrentTask, "core1_access");
        health.core1FreeStackBytes = 0;
    } else {
        health.core1IsIdle = false;
        strncpy(health.core1CurrentTask, name ? name : "unknown",
                sizeof(health.core1CurrentTask) - 1);
        health.core1FreeStackBytes = free;
        health.core0IsIdle = false;
        strcpy(health.core0CurrentTask, "loop");
        health.core0FreeStackBytes = 0;
    }
}

static void collectTaskInfo() {
    health.taskCount = 0;
    TaskHandle_t cur = xTaskGetCurrentTaskHandle();
    if (!cur || health.taskCount >= 16) return;

    TaskInfo& t = health.tasks[health.taskCount++];
    const char* n = pcTaskGetName(cur);
    strncpy(t.name, n ? n : "unknown", sizeof(t.name) - 1);
    t.name[sizeof(t.name) - 1] = '\0';
    t.core           = xPortGetCoreID();
    t.stackHighWater = uxTaskGetStackHighWaterMark(cur) * sizeof(StackType_t);
    t.stackSize      = 0;
    t.priority       = uxTaskPriorityGet(cur);
    t.isRunning      = true;
}

static void collectStorageInfo() {
    uint32_t usedSize = 0;
    File root = LittleFS.open("/");
    if (root && root.isDirectory()) {
        File f = root.openNextFile();
        while (f) {
            if (!f.isDirectory()) usedSize += f.size();
            f = root.openNextFile();
        }
        root.close();
    }

    health.littlefsTotalBytes = 1536000;   // 1.5 MB typical partition
    health.littlefsUsedBytes  = usedSize;
    health.littlefsFreeBytes  = (health.littlefsTotalBytes > usedSize)
                                    ? health.littlefsTotalBytes - usedSize : 0;

    // Read NVS counts under mutex to prevent race with Core 1 NVS writes
    {
        ThreadSafe::Guard guard(50);
        if (guard.isAcquired()) {
            health.nvsUsedEntries = NVSStore::whitelistCount()
                                  + NVSStore::blacklistCount()
                                  + NVSStore::pendingCount();
        }
        // If mutex not acquired, keep previous value (stale but safe)
    }
}

static void collectWatchdogInfo() {
    health.watchdogEnabled   = true;
    health.watchdogTimeoutMs = CONFIG_ESP_TASK_WDT_TIMEOUT_S * 1000;
}

static void collectVoltageInfo() {
    // Multi-sample ADC read for noise reduction (16 samples)
    uint32_t sum = 0;
    for (int i = 0; i < 16; i++) {
        sum += analogRead(VOLTAGE_MONITOR_PIN);
        delayMicroseconds(100);
    }
    float avg = sum / 16.0f;
    // ESP32 ADC at 11dB attenuation: 0-4095 maps to ~0-3.3V
    health.voltage3v3 = (avg / 4095.0f) * 3.3f * VOLTAGE_DIVIDER_RATIO;
}

// ==================== PUBLIC API ====================

void HealthMonitor::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");

    bootTimeMs      = millis();
    lastCloudSyncMs = 0;
    health          = {};

    health.rfidHealthy  = true;
    health.wifiConnected = false;
    health.ntpSynced     = false;

    // Configure ADC for voltage monitoring
    analogSetPinAttenuation(VOLTAGE_MONITOR_PIN, ADC_11db);

    collectProcessorInfo();
    collectWatchdogInfo();

    Serial.println("[HEALTH] Monitor initialized for device: " + deviceId);
}

void HealthMonitor::collectAll() {
    collectSystemHealth();
    collectWifiHealth();
    collectCoreStatus();
    collectTaskInfo();
    collectStorageInfo();
    collectRfidHealth();
    collectVoltageInfo();
}

void HealthMonitor::update() {
    uint32_t now = millis();
    if (now - lastCloudSyncMs >= CLOUD_SYNC_INTERVAL_MS) {
        lastCloudSyncMs = now;
        collectAll();          // only collect right before pushing
        pushHealthToSupabase();
    }
}

void HealthMonitor::reportWifiDisconnect() {
    health.wifiDisconnectCount++;
}

DeviceHealth HealthMonitor::getHealth() {
    collectAll();
    return health;
}

void HealthMonitor::syncToCloud() {
    pushHealthToSupabase();
}

// ==================== SUPABASE PUSH ====================

void HealthMonitor::pushHealthToSupabase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HEALTH] Cannot sync - WiFi not connected");
        return;
    }

    String json = "{";
    json += "\"device_id\":\"" + deviceId + "\",";
    json += "\"firmware_version\":\"" FW_VERSION_STR "\",";

    // ---- System ----
    json += "\"uptime_seconds\":"          + String(health.uptimeSeconds)         + ",";
    json += "\"free_heap_bytes\":"         + String(health.freeHeapBytes)         + ",";
    json += "\"total_heap_bytes\":"        + String(health.totalHeapBytes)        + ",";
    json += "\"min_free_heap_bytes\":"     + String(health.minFreeHeapBytes)      + ",";
    json += "\"largest_free_block_bytes\":" + String(health.largestFreeBlockBytes) + ",";

    // ---- WiFi ----
    json += "\"wifi_connected\":"       + String(health.wifiConnected ? "true" : "false") + ",";
    json += "\"wifi_rssi\":"            + String(health.wifiRssi)                         + ",";
    json += "\"ntp_synced\":"           + String(health.ntpSynced ? "true" : "false")     + ",";
    json += "\"wifi_disconnect_count\":" + String(health.wifiDisconnectCount)              + ",";

    // ---- Processor ----
    json += "\"cpu_freq_mhz\":"  + String(health.cpuFreqMhz)    + ",";
    json += "\"chip_model\":"    + String(health.chipModel)      + ",";
    json += "\"chip_revision\":" + String(health.chipRevision)   + ",";
    json += "\"chip_cores\":"    + String(health.chipCores)      + ",";

    // ---- Core 0 ----
    json += "\"core0_is_idle\":"          + String(health.core0IsIdle ? "true" : "false")                    + ",";
    json += "\"core0_current_task\":\""   + jsonEscape(String(health.core0CurrentTask))                      + "\",";
    json += "\"core0_free_stack_bytes\":" + String(health.core0FreeStackBytes)                                + ",";

    // ---- Core 1 ----
    json += "\"core1_is_idle\":"          + String(health.core1IsIdle ? "true" : "false")                    + ",";
    json += "\"core1_current_task\":\""   + jsonEscape(String(health.core1CurrentTask))                      + "\",";
    json += "\"core1_free_stack_bytes\":" + String(health.core1FreeStackBytes)                                + ",";

    // ---- Storage ----
    json += "\"storage_littlefs_total_bytes\":" + String(health.littlefsTotalBytes) + ",";
    json += "\"storage_littlefs_used_bytes\":"  + String(health.littlefsUsedBytes)  + ",";
    json += "\"storage_littlefs_free_bytes\":"  + String(health.littlefsFreeBytes)  + ",";
    json += "\"storage_nvs_used_entries\":"      + String(health.nvsUsedEntries)     + ",";

    // ---- Watchdog ----
    json += "\"watchdog_enabled\":"    + String(health.watchdogEnabled ? "true" : "false") + ",";
    json += "\"watchdog_timeout_ms\":" + String(health.watchdogTimeoutMs)                  + ",";

    // ---- Tasks ----
    json += "\"tasks\":[";
    for (uint8_t i = 0; i < health.taskCount; i++) {
        if (i > 0) json += ",";
        json += "{";
        json += "\"name\":\""            + jsonEscape(String(health.tasks[i].name)) + "\",";
        json += "\"core\":"              + String(health.tasks[i].core)              + ",";
        json += "\"stack_high_water\":"  + String(health.tasks[i].stackHighWater)    + ",";
        json += "\"stack_size\":"        + String(health.tasks[i].stackSize)         + ",";
        json += "\"priority\":"          + String(health.tasks[i].priority)          + ",";
        json += "\"is_running\":"        + String(health.tasks[i].isRunning ? "true" : "false");
        json += "}";
    }
    json += "],";
    json += "\"task_count\":" + String(health.taskCount) + ",";

    // ---- RFID / PN532 ----
    json += "\"rfid_healthy\":"          + String(health.rfidHealthy ? "true" : "false")        + ",";
    json += "\"rfid_communication_ok\":" + String(health.rfidCommunicationOk ? "true" : "false") + ",";
    json += "\"rfid_sam_configured\":"   + String(health.rfidSamConfigured ? "true" : "false")   + ",";
    json += "\"rfid_ic\":"               + String(health.rfidIC)                                 + ",";
    json += "\"rfid_firmware_major\":"   + String(health.rfidFirmwareMaj)                        + ",";
    json += "\"rfid_firmware_minor\":"   + String(health.rfidFirmwareMin)                        + ",";
    json += "\"rfid_firmware_support\":" + String(health.rfidFirmwareSupport)                    + ",";
    json += "\"rfid_reinit_count\":"     + String(health.rfidReinitCount)                        + ",";
    json += "\"rfid_poll_count\":"       + String(health.rfidPollCount)                          + ",";

    // ---- Voltage ----
    json += "\"voltage_3v3\":"           + String(health.voltage3v3, 2)                            + ",";

    // ---- RFID timestamps (nullable) ----
    if (health.lastRfidError.length() > 0) {
        json += "\"last_rfid_error\":\""      + jsonEscape(health.lastRfidError) + "\",";
        json += "\"last_rfid_error_time\":\"" + health.lastRfidErrorTime         + "\",";
    } else {
        json += "\"last_rfid_error\":null,";
        json += "\"last_rfid_error_time\":null,";
    }

    if (health.lastSuccessfulReadTime.length() > 0) {
        json += "\"last_successful_read_time\":\"" + health.lastSuccessfulReadTime + "\"";
    } else {
        json += "\"last_successful_read_time\":null";
    }

    json += "}";

    // ---- HTTP POST (upsert) ----
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/device_health";

    http.begin(url);
    http.addHeader("apikey",        SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type",  "application/json");
    http.addHeader("Prefer",        "resolution=merge-duplicates");

    int code = http.POST(json);
    http.end();

    if (code == 200 || code == 201) {
        Serial.println("[HEALTH] Cloud sync OK");
    } else {
        Serial.printf("[HEALTH] Cloud sync FAILED HTTP %d\n", code);
    }
}
