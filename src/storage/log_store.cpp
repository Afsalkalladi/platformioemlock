#include "log_store.h"
#include <LittleFS.h>
#include <time.h>
#include "../core/thread_safe.h"

// ========== CONFIG ==========
static const uint32_t MAX_DAYS_LOCAL = 30;

// ========== HELPERS ==========
static const char* logEventToStr(LogEvent e) {
    switch (e) {
        case LogEvent::ACCESS_GRANTED:  return "ACCESS_GRANTED";
        case LogEvent::ACCESS_DENIED:   return "ACCESS_DENIED";
        case LogEvent::UNKNOWN_CARD:    return "UNKNOWN_CARD";
        case LogEvent::RFID_INVALID:    return "RFID_INVALID";
        case LogEvent::EXIT_UNLOCK:     return "EXIT_UNLOCK";
        case LogEvent::REMOTE_UNLOCK:   return "REMOTE_UNLOCK";
        case LogEvent::SYSTEM_BOOT:     return "SYSTEM_BOOT";
        case LogEvent::WIFI_LOST:       return "WIFI_LOST";
        case LogEvent::COMMAND_ERROR:   return "COMMAND_ERROR";
        case LogEvent::UID_WHITELISTED: return "UID_WHITELISTED";
        case LogEvent::UID_BLACKLISTED: return "UID_BLACKLISTED";
        case LogEvent::UID_REMOVED:     return "UID_REMOVED";
        case LogEvent::UID_SYNC:        return "UID_SYNC";
        default:                        return "UNKNOWN";
    }
}

static String currentDate() {
    time_t now = time(nullptr);
    struct tm t;
    localtime_r(&now, &t);

    char buf[9];
    snprintf(buf, sizeof(buf), "%04d%02d%02d",
             t.tm_year + 1900,
             t.tm_mon + 1,
             t.tm_mday);
    return String(buf);
}

static String currentTimestamp() {
    time_t now = time(nullptr);
    struct tm t;
    localtime_r(&now, &t);

    // Include IST timezone offset (+05:30) in the timestamp
    char buf[30];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d+05:30",
             t.tm_year + 1900,
             t.tm_mon + 1,
             t.tm_mday,
             t.tm_hour,
             t.tm_min,
             t.tm_sec);
    return String(buf);
}

// ========== IMPLEMENTATION ==========
void LogStore::init() {
    if (!LittleFS.begin(true)) {
        Serial.println("[LOG] LittleFS mount failed");
        return;
    }

    cleanupOldLogs();
    log(LogEvent::SYSTEM_BOOT, "-", "boot");
}

void LogStore::log(LogEvent evt, const char* uid, const char* info) {
    // CRITICAL: Lock mutex to prevent crash when Core 1 (RFID) and Core 0 (WiFi) access LittleFS simultaneously
    ThreadSafe::Guard guard(200);  // 200ms timeout
    if (!guard.isAcquired()) {
        Serial.println("[LOG] Failed to acquire mutex, skipping log");
        return;
    }
    
    String filename = "/log_" + currentDate() + ".txt";

    File f = LittleFS.open(filename, FILE_APPEND);
    if (!f) {
        Serial.println("[LOG] Failed to open log file");
        return;
    }

    f.printf("%s | %s | %s | %s\n",
             currentTimestamp().c_str(),
             logEventToStr(evt),
             uid,
             info);

    f.close();
}

void LogStore::cleanupOldLogs() {
    File root = LittleFS.open("/");
    if (!root) return;

    time_t now = time(nullptr);

    File f = root.openNextFile();
    while (f) {
        String name = f.name(); // /log_YYYYMMDD.txt or log_YYYYMMDD.txt
        
        // Handle both with and without leading slash
        String logPrefix = name.startsWith("/") ? "/log_" : "log_";
        
        if (name.startsWith(logPrefix)) {
            String date = name.substring(logPrefix.length(), logPrefix.length() + 8);
            
            // Delete 1970 logs (created before NTP sync)
            if (date.startsWith("1970")) {
                Serial.printf("[LOG] Deleting invalid 1970 log: %s\n", name.c_str());
                f.close();
                LittleFS.remove(name.startsWith("/") ? name : "/" + name);
                f = root.openNextFile();
                continue;
            }
            
            struct tm t = {};
            strptime(date.c_str(), "%Y%m%d", &t);
            time_t fileTime = mktime(&t);

            double days = difftime(now, fileTime) / 86400.0;
            if (days > MAX_DAYS_LOCAL) {
                f.close();
                LittleFS.remove(name.startsWith("/") ? name : "/" + name);
                f = root.openNextFile();
                continue;
            }
        }
        f = root.openNextFile();
    }
}

void LogStore::forEach(std::function<void(const LogEntry&)> callback) {
    // Lock mutex to prevent crash during file iteration
    ThreadSafe::Guard guard(500);  // 500ms timeout for longer operation
    if (!guard.isAcquired()) {
        Serial.println("[LOG] Failed to acquire mutex for forEach");
        return;
    }
    
    File root = LittleFS.open("/");
    if (!root) {
        Serial.println("[LOG] Failed to open root");
        return;
    }

    Serial.println("[LOG] Scanning log files...");

    File file = root.openNextFile();
    while (file) {
        String name = String(file.name());
        Serial.printf("[LOG] Found file: %s\n", name.c_str());
        
        // Check for log files (name is "log_YYYYMMDD.txt" without leading slash)
        if (name.startsWith("log_") || name.startsWith("/log_")) {
            Serial.printf("[LOG] Processing: %s\n", name.c_str());
            
            // Read each line from log file
            while (file.available()) {
                String line = file.readStringUntil('\n');
                line.trim();
                
                if (line.length() < 10) continue;

                // Parse: "2026-01-20 20:45:03 | ACCESS_GRANTED | A1B2C3D4 | info"
                int pipe1 = line.indexOf('|');
                int pipe2 = line.indexOf('|', pipe1 + 1);
                int pipe3 = line.indexOf('|', pipe2 + 1);

                if (pipe1 < 0 || pipe2 < 0 || pipe3 < 0) continue;

                String timestamp = line.substring(0, pipe1);
                String eventStr = line.substring(pipe1 + 1, pipe2);
                String uid = line.substring(pipe2 + 1, pipe3);
                String info = line.substring(pipe3 + 1);

                timestamp.trim();
                eventStr.trim();
                uid.trim();
                info.trim();

                LogEntry entry = {};
                entry.timestamp = 0;
                
                // Store the timestamp string for syncing
                strncpy(entry.timestampStr, timestamp.c_str(), sizeof(entry.timestampStr) - 1);
                entry.timestampStr[sizeof(entry.timestampStr) - 1] = '\0';
                
                // Map event string to enum (support both old and new names)
                if (eventStr == "ACCESS_GRANTED" || eventStr == "RFID_GRANTED") 
                    entry.event = LogEvent::ACCESS_GRANTED;
                else if (eventStr == "ACCESS_DENIED" || eventStr == "RFID_DENIED") 
                    entry.event = LogEvent::ACCESS_DENIED;
                else if (eventStr == "UNKNOWN_CARD" || eventStr == "RFID_PENDING") 
                    entry.event = LogEvent::UNKNOWN_CARD;
                else if (eventStr == "REMOTE_UNLOCK") 
                    entry.event = LogEvent::REMOTE_UNLOCK;
                else 
                    continue; // Skip non-access events

                strncpy(entry.uid, uid.c_str(), sizeof(entry.uid) - 1);
                strncpy(entry.info, info.c_str(), sizeof(entry.info) - 1);

                callback(entry);
            }
        }
        file = root.openNextFile();
    }
    Serial.println("[LOG] Done scanning");
}

void LogStore::clearAllLogs() {
    // Lock mutex to prevent crash during file deletion
    ThreadSafe::Guard guard(500);  // 500ms timeout
    if (!guard.isAcquired()) {
        Serial.println("[LOG] Failed to acquire mutex for clearAllLogs");
        return;
    }
    
    File root = LittleFS.open("/");
    if (!root) {
        Serial.println("[LOG] Failed to open root for clearing");
        return;
    }

    Serial.println("[LOG] Clearing all log files...");
    
    // Collect files to delete first (can't delete while iterating)
    String filesToDelete[32];
    int fileCount = 0;

    File file = root.openNextFile();
    while (file && fileCount < 32) {
        String name = String(file.name());
        
        // Check for log files
        if (name.startsWith("log_") || name.startsWith("/log_")) {
            // Store full path
            if (name.startsWith("/")) {
                filesToDelete[fileCount++] = name;
            } else {
                filesToDelete[fileCount++] = "/" + name;
            }
        }
        file.close();
        file = root.openNextFile();
    }
    root.close();

    // Now delete all collected files
    for (int i = 0; i < fileCount; i++) {
        if (LittleFS.remove(filesToDelete[i])) {
            Serial.printf("[LOG] Deleted: %s\n", filesToDelete[i].c_str());
        } else {
            Serial.printf("[LOG] Failed to delete: %s\n", filesToDelete[i].c_str());
        }
    }

    Serial.printf("[LOG] Cleared %d log files\n", fileCount);
}
