#include "health_monitor.h"
#include "supabase_config.h"
#include "wifi_manager.h"
#include "../access/rfid_manager.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <LittleFS.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "../storage/nvs_store.h"

// ========== STATIC STATE ==========
static DeviceHealth health = {};
static String deviceId;
static uint32_t lastCloudSyncMs = 0;
static uint32_t bootTimeMs = 0;

// Cloud sync interval (every 60 seconds or on error)
static const uint32_t CLOUD_SYNC_INTERVAL_MS = 60000;

// ========== FORWARD DECLARATIONS ==========
static void collectRfidHealth();

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

// Collect task information
static void collectTaskInfo() {
    health.taskCount = 0;
    
    // Get current task info using available FreeRTOS APIs
    TaskHandle_t currentTask = xTaskGetCurrentTaskHandle();
    if (currentTask != nullptr && health.taskCount < 16) {
        TaskInfo& info = health.tasks[health.taskCount++];
        
        // Get task name
        const char* taskName = pcTaskGetName(currentTask);
        if (taskName) {
            strncpy(info.name, taskName, sizeof(info.name) - 1);
            info.name[sizeof(info.name) - 1] = '\0';
        } else {
            strcpy(info.name, "unknown");
        }
        
        // Get core ID
        info.core = xPortGetCoreID();
        
        // Get stack high water mark
        UBaseType_t stackHighWater = uxTaskGetStackHighWaterMark(currentTask);
        info.stackHighWater = stackHighWater * sizeof(StackType_t);
        
        // Stack size not directly available
        info.stackSize = 0;
        
        // Get priority
        info.priority = uxTaskPriorityGet(currentTask);
        
        // Check if task is running (simplified - we can't directly check state)
        info.isRunning = true;  // Assume running if we can query it
    }
}

// Get core status
static void collectCoreStatus() {
    uint8_t currentCore = xPortGetCoreID();
    TaskHandle_t currentTask = xTaskGetCurrentTaskHandle();
    
    if (currentTask != nullptr) {
        // Get task name
        const char* taskName = pcTaskGetName(currentTask);
        
        // Get stack high water mark
        UBaseType_t stackHighWater = uxTaskGetStackHighWaterMark(currentTask);
        uint32_t freeStackBytes = stackHighWater * sizeof(StackType_t);
        
        if (currentCore == 0) {
            // We're on Core 0
            health.core0IsIdle = false;  // Can't determine idle state without vTaskGetInfo
            if (taskName) {
                strncpy(health.core0CurrentTask, taskName, sizeof(health.core0CurrentTask) - 1);
                health.core0CurrentTask[sizeof(health.core0CurrentTask) - 1] = '\0';
            } else {
                strcpy(health.core0CurrentTask, "unknown");
            }
            health.core0FreeStackBytes = freeStackBytes;
            
            // Core 1 is unknown from Core 0
            health.core1IsIdle = false;
            strcpy(health.core1CurrentTask, "core1_access");
            health.core1FreeStackBytes = 0;
        } else {
            // We're on Core 1
            health.core1IsIdle = false;  // Can't determine idle state without vTaskGetInfo
            if (taskName) {
                strncpy(health.core1CurrentTask, taskName, sizeof(health.core1CurrentTask) - 1);
                health.core1CurrentTask[sizeof(health.core1CurrentTask) - 1] = '\0';
            } else {
                strcpy(health.core1CurrentTask, "unknown");
            }
            health.core1FreeStackBytes = freeStackBytes;
            
            // Core 0 is unknown from Core 1
            health.core0IsIdle = false;
            strcpy(health.core0CurrentTask, "loop");
            health.core0FreeStackBytes = 0;
        }
    } else {
        // Fallback
        health.core0IsIdle = (currentCore == 0);
        health.core1IsIdle = (currentCore == 1);
        strcpy(health.core0CurrentTask, currentCore == 0 ? "unknown" : "N/A");
        strcpy(health.core1CurrentTask, currentCore == 1 ? "unknown" : "N/A");
        health.core0FreeStackBytes = 0;
        health.core1FreeStackBytes = 0;
    }
}

// Get storage information
static void collectStorageInfo() {
    // LittleFS info - calculate manually by iterating files
    uint32_t totalSize = 0;
    uint32_t usedSize = 0;
    
    File root = LittleFS.open("/");
    if (root && root.isDirectory()) {
        File file = root.openNextFile();
        while (file) {
            if (!file.isDirectory()) {
                usedSize += file.size();
            }
            file = root.openNextFile();
        }
        root.close();
    }
    
    // LittleFS partition size (typically 1.5MB for ESP32)
    // This is an approximation - actual partition size depends on partition table
    health.littlefsTotalBytes = 1536000;  // 1.5MB typical
    health.littlefsUsedBytes = usedSize;
    health.littlefsFreeBytes = health.littlefsTotalBytes > usedSize ? 
                               health.littlefsTotalBytes - usedSize : 0;
    
    // NVS entries count (approximate - count keys in each namespace)
    health.nvsUsedEntries = NVSStore::whitelistCount() + 
                            NVSStore::blacklistCount() + 
                            NVSStore::pendingCount();
}

// Get processor information
static void collectProcessorInfo() {
    health.cpuFreqMhz = ESP.getCpuFreqMHz();
    
    // Map chip model string to number
    const char* modelStr = ESP.getChipModel();
    if (strstr(modelStr, "ESP32-S3")) {
        health.chipModel = 5;  // ESP32-S3
    } else if (strstr(modelStr, "ESP32-C3")) {
        health.chipModel = 9;  // ESP32-C3
    } else if (strstr(modelStr, "ESP32-S2")) {
        health.chipModel = 2;  // ESP32-S2
    } else {
        health.chipModel = 0;  // ESP32 (default)
    }
    
    health.chipRevision = ESP.getChipRevision();
    health.chipCores = ESP.getChipCores();
}

// Get watchdog information
static void collectWatchdogInfo() {
    // Check if watchdog is enabled
    health.watchdogEnabled = true;  // ESP32 typically has watchdog enabled
    health.watchdogTimeoutMs = CONFIG_ESP_TASK_WDT_TIMEOUT_S * 1000;  // Convert to ms
}

// Collect comprehensive RFID health information (PN532)
static void collectRfidHealth() {
    RFIDHealth rfidHealth = RFIDManager::getHealth();

    health.rfidCommunicationOk  = rfidHealth.communicationOk;
    health.rfidSamConfigured    = rfidHealth.samConfigured;
    health.rfidIC               = rfidHealth.ic;
    health.rfidFirmwareMaj      = rfidHealth.firmwareVersionMaj;
    health.rfidFirmwareMin      = rfidHealth.firmwareVersionMin;
    health.rfidFirmwareSupport  = rfidHealth.firmwareSupport;
    health.rfidPollCount        = rfidHealth.pollCount;
    health.rfidReinitCount      = rfidHealth.reinitCount;

    // Overall health: communication OK and SAM configured
    health.rfidHealthy = rfidHealth.communicationOk && rfidHealth.samConfigured;
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
    
    // Initialize processor info (static)
    collectProcessorInfo();
    collectWatchdogInfo();
    
    Serial.println("[HEALTH] Monitor initialized for device: " + deviceId);
}

void HealthMonitor::update() {
    // Update system health metrics
    health.uptimeSeconds = (millis() - bootTimeMs) / 1000;
    health.freeHeapBytes = ESP.getFreeHeap();
    health.totalHeapBytes = ESP.getHeapSize();
    health.minFreeHeapBytes = ESP.getMinFreeHeap();
    health.largestFreeBlockBytes = ESP.getMaxAllocHeap();
    
    health.wifiConnected = WiFi.status() == WL_CONNECTED;
    health.wifiRssi = WiFi.RSSI();
    health.ntpSynced = WiFiManager::isTimeValid();
    
    // Collect dynamic information
    collectCoreStatus();
    collectTaskInfo();
    collectStorageInfo();
    collectRfidHealth();  // Collect comprehensive RFID health
    
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

void HealthMonitor::setRfidIC(uint8_t ic) {
    health.rfidIC = ic;
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
    health.totalHeapBytes = ESP.getHeapSize();
    health.minFreeHeapBytes = ESP.getMinFreeHeap();
    health.largestFreeBlockBytes = ESP.getMaxAllocHeap();
    
    // Collect latest information
    collectCoreStatus();
    collectTaskInfo();
    collectStorageInfo();
    collectRfidHealth();  // Collect comprehensive RFID health
    
    return health;
}

void HealthMonitor::syncToCloud() {
    pushHealthToSupabase();
}

// Helper to escape JSON strings
static String jsonEscape(const String& s) {
    String out;
    out.reserve(s.length() + 16);
    for (size_t i = 0; i < s.length(); i++) {
        char c = s[i];
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else out += c;
    }
    return out;
}

void HealthMonitor::pushHealthToSupabase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HEALTH] Cannot sync - WiFi not connected");
        return;
    }
    
    // Build comprehensive JSON payload
    String json = "{";
    json += "\"device_id\":\"" + deviceId + "\",";
    
    // System Health
    json += "\"uptime_seconds\":" + String(health.uptimeSeconds) + ",";
    json += "\"free_heap_bytes\":" + String(health.freeHeapBytes) + ",";
    json += "\"total_heap_bytes\":" + String(health.totalHeapBytes) + ",";
    json += "\"min_free_heap_bytes\":" + String(health.minFreeHeapBytes) + ",";
    json += "\"largest_free_block_bytes\":" + String(health.largestFreeBlockBytes) + ",";
    
    // WiFi Status
    json += "\"wifi_rssi\":" + String(health.wifiRssi) + ",";
    json += "\"wifi_connected\":" + String(health.wifiConnected ? "true" : "false") + ",";
    json += "\"ntp_synced\":" + String(health.ntpSynced ? "true" : "false") + ",";
    json += "\"wifi_disconnect_count\":" + String(health.wifiDisconnectCount) + ",";
    
    // Processor Information
    json += "\"cpu_freq_mhz\":" + String(health.cpuFreqMhz) + ",";
    json += "\"chip_model\":" + String(health.chipModel) + ",";
    json += "\"chip_revision\":" + String(health.chipRevision) + ",";
    json += "\"chip_cores\":" + String(health.chipCores) + ",";
    
    // Core 0 Status
    json += "\"core0_id\":0,";
    json += "\"core0_is_idle\":" + String(health.core0IsIdle ? "true" : "false") + ",";
    json += "\"core0_current_task\":\"" + jsonEscape(String(health.core0CurrentTask)) + "\",";
    json += "\"core0_free_stack_bytes\":" + String(health.core0FreeStackBytes) + ",";
    json += "\"core0_cpu_usage_percent\":null,";  // Would need more complex calculation
    
    // Core 1 Status
    json += "\"core1_id\":1,";
    json += "\"core1_is_idle\":" + String(health.core1IsIdle ? "true" : "false") + ",";
    json += "\"core1_current_task\":\"" + jsonEscape(String(health.core1CurrentTask)) + "\",";
    json += "\"core1_free_stack_bytes\":" + String(health.core1FreeStackBytes) + ",";
    json += "\"core1_cpu_usage_percent\":null,";  // Would need more complex calculation
    
    // Storage Information
    json += "\"storage_littlefs_total_bytes\":" + String(health.littlefsTotalBytes) + ",";
    json += "\"storage_littlefs_used_bytes\":" + String(health.littlefsUsedBytes) + ",";
    json += "\"storage_littlefs_free_bytes\":" + String(health.littlefsFreeBytes) + ",";
    json += "\"storage_nvs_used_entries\":" + String(health.nvsUsedEntries) + ",";
    
    // Watchdog Information
    json += "\"watchdog_enabled\":" + String(health.watchdogEnabled ? "true" : "false") + ",";
    json += "\"watchdog_timeout_ms\":" + String(health.watchdogTimeoutMs) + ",";
    
    // Task Information (as JSON array)
    json += "\"tasks\":[";
    for (uint8_t i = 0; i < health.taskCount; i++) {
        if (i > 0) json += ",";
        json += "{";
        json += "\"name\":\"" + jsonEscape(String(health.tasks[i].name)) + "\",";
        json += "\"core\":" + String(health.tasks[i].core) + ",";
        json += "\"stack_high_water\":" + String(health.tasks[i].stackHighWater) + ",";
        json += "\"stack_size\":" + String(health.tasks[i].stackSize) + ",";
        json += "\"priority\":" + String(health.tasks[i].priority) + ",";
        json += "\"is_running\":" + String(health.tasks[i].isRunning ? "true" : "false");
        json += "}";
    }
    json += "],";
    json += "\"task_count\":" + String(health.taskCount) + ",";
    
    // RFID Health (PN532)
    json += "\"rfid_healthy\":" + String(health.rfidHealthy ? "true" : "false") + ",";
    json += "\"rfid_communication_ok\":" + String(health.rfidCommunicationOk ? "true" : "false") + ",";
    json += "\"rfid_sam_configured\":" + String(health.rfidSamConfigured ? "true" : "false") + ",";
    json += "\"rfid_ic\":" + String(health.rfidIC) + ",";
    json += "\"rfid_firmware_major\":" + String(health.rfidFirmwareMaj) + ",";
    json += "\"rfid_firmware_minor\":" + String(health.rfidFirmwareMin) + ",";
    json += "\"rfid_firmware_support\":" + String(health.rfidFirmwareSupport) + ",";
    json += "\"rfid_reinit_count\":" + String(health.rfidReinitCount) + ",";
    json += "\"rfid_soft_reset_count\":" + String(health.rfidSoftResetCount) + ",";
    json += "\"rfid_poll_count\":" + String(health.rfidPollCount) + ",";
    
    // Handle nullable string fields
    if (health.lastRfidError.length() > 0) {
        json += "\"last_rfid_error\":\"" + jsonEscape(health.lastRfidError) + "\",";
        json += "\"last_rfid_error_time\":\"" + health.lastRfidErrorTime + "\",";
    } else {
        json += "\"last_rfid_error\":null,";
        json += "\"last_rfid_error_time\":null,";
    }
    
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
