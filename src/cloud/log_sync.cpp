#include "log_sync.h"
#include <LittleFS.h>
#include <FS.h>
#include <time.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "../storage/log_store.h"
#include "supabase_config.h"

// ========== STATE ==========
static bool syncing = false;
static File dir;
static File currentFile;

// Scheduled sync state
static int lastSyncDay = -1;        // Track which day we last synced
static bool scheduledSyncDone = false;  // Prevent multiple syncs on same day

// Device ID for cloud sync
static String deviceId;

// ========== PRIVATE FUNCTIONS ==========

static bool performCloudSync() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[AUTO_SYNC] WiFi not connected, skipping sync");
        return false;
    }

    Serial.println("[AUTO_SYNC] Starting automatic cloud sync...");

    // Build JSON array of all logs
    String body = "[";
    uint16_t count = 0;
    bool first = true;

    LogStore::forEach([&body, &count, &first](const LogEntry& entry) {
        const char* eventType = nullptr;
        
        switch (entry.event) {
            case LogEvent::ACCESS_GRANTED:
                eventType = "GRANTED";
                break;
            case LogEvent::ACCESS_DENIED:
                eventType = "DENIED";
                break;
            case LogEvent::UNKNOWN_CARD:
                eventType = "PENDING";
                break;
            case LogEvent::REMOTE_UNLOCK:
                eventType = "REMOTE";
                break;
            default:
                return;
        }

        if (!first) body += ",";
        first = false;

        // Convert timestamp to ISO 8601 format
        String isoTimestamp = String(entry.timestampStr);
        isoTimestamp.replace(" ", "T");

        body += "{\"device_id\":\"" + deviceId +
                "\",\"uid\":\"" + String(entry.uid) +
                "\",\"event_type\":\"" + String(eventType) +
                "\",\"logged_at\":\"" + isoTimestamp + "\"}";
        count++;
    });

    body += "]";

    if (count == 0) {
        Serial.println("[AUTO_SYNC] No logs to sync");
        return true;  // Success (nothing to do)
    }

    Serial.printf("[AUTO_SYNC] Sending %d logs...\n", count);

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/access_logs";

    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal");

    int code = http.POST(body);
    http.end();

    if (code == 201 || code == 200) {
        Serial.printf("[AUTO_SYNC] Upload OK - %d logs\n", count);
        
        // Clear local logs after successful sync
        LogStore::clearAllLogs();
        Serial.println("[AUTO_SYNC] Local logs cleared");
        return true;
    } else {
        Serial.printf("[AUTO_SYNC] Upload FAILED HTTP %d\n", code);
        return false;
    }
}

static void checkScheduledSync() {
    // Get current time
    time_t now = time(nullptr);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);

    // Check if time is valid (year > 2020 means NTP synced)
    if (timeinfo.tm_year < 120) {  // 120 = year 2020
        return;  // Time not synced yet
    }

    int currentDay = timeinfo.tm_yday;  // Day of year (0-365)
    int currentHour = timeinfo.tm_hour;
    int currentMin = timeinfo.tm_min;

    // Reset sync flag when day changes
    if (currentDay != lastSyncDay) {
        scheduledSyncDone = false;
        lastSyncDay = currentDay;
        Serial.printf("[AUTO_SYNC] New day detected: %04d-%02d-%02d\n",
                      timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday);
    }

    // Check if it's midnight (00:00 - 00:05 window) and sync not done today
    if (!scheduledSyncDone && currentHour == 0 && currentMin < 5) {
        Serial.println("[AUTO_SYNC] Midnight sync triggered!");
        
        if (performCloudSync()) {
            scheduledSyncDone = true;
            Serial.println("[AUTO_SYNC] Scheduled sync completed successfully");
        } else {
            Serial.println("[AUTO_SYNC] Scheduled sync failed, will retry");
            // Don't set scheduledSyncDone so it will retry in next update cycle
        }
    }
}

// ========== PUBLIC FUNCTIONS ==========

void LogSync::init() {
    syncing = false;
    scheduledSyncDone = false;
    lastSyncDay = -1;
    
    // Get device ID from MAC address
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    
    Serial.println("[AUTO_SYNC] Log sync initialized with auto-sync at midnight");
}

void LogSync::triggerSync() {
    if (syncing) return;

    Serial.println("[SYNC] Manual log sync started");

    dir = LittleFS.open("/");
    if (!dir || !dir.isDirectory()) {
        Serial.println("[SYNC] Failed to open FS root");
        return;
    }

    syncing = true;
}

void LogSync::update() {
    // Check for scheduled midnight sync
    static uint32_t lastScheduleCheck = 0;
    if (millis() - lastScheduleCheck >= 60000) {  // Check every 60 seconds
        lastScheduleCheck = millis();
        checkScheduledSync();
    }

    // Handle manual sync (for serial debugging)
    if (!syncing) return;

    // If no file currently open, get next file
    if (!currentFile) {
        currentFile = dir.openNextFile();

        if (!currentFile) {
            Serial.println("[SYNC] Log sync completed");
            syncing = false;
            dir.close();
            return;
        }

        if (!String(currentFile.name()).startsWith("/log_")) {
            currentFile.close();
            return;
        }

        Serial.print("[SYNC] Uploading ");
        Serial.println(currentFile.name());
    }

    // Read file line-by-line
    while (currentFile.available()) {
        String line = currentFile.readStringUntil('\n');
        Serial.print("[CLOUD] ");
        Serial.println(line);
        return; // ONE LINE PER UPDATE (NON-BLOCKING)
    }

    // File finished
    currentFile.close();
}

bool LogSync::isSyncing() {
    return syncing;
}

void LogSync::triggerAutoSync() {
    Serial.println("[AUTO_SYNC] Manual trigger of cloud sync");
    performCloudSync();
}
