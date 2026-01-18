#include "log_store.h"
#include <LittleFS.h>
#include <time.h>

// ========== CONFIG ==========
static const uint32_t MAX_DAYS_LOCAL = 30;

// ========== HELPERS ==========
static const char* logEventToStr(LogEvent e) {
    switch (e) {
        case LogEvent::RFID_GRANTED:  return "RFID_GRANTED";
        case LogEvent::RFID_DENIED:   return "RFID_DENIED";
        case LogEvent::RFID_PENDING:  return "RFID_PENDING";
        case LogEvent::RFID_INVALID:  return "RFID_INVALID";
        case LogEvent::EXIT_UNLOCK:   return "EXIT_UNLOCK";
        case LogEvent::REMOTE_UNLOCK: return "REMOTE_UNLOCK";
        case LogEvent::SYSTEM_BOOT:   return "SYSTEM_BOOT";
        case LogEvent::WIFI_LOST:     return "WIFI_LOST";
        case LogEvent::COMMAND_ERROR: return "COMMAND_ERROR";
        default:                      return "UNKNOWN";
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

    char buf[20];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
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
        String name = f.name(); // /log_YYYYMMDD.txt
        if (name.startsWith("/log_")) {
            String date = name.substring(5, 13);
            struct tm t = {};
            strptime(date.c_str(), "%Y%m%d", &t);
            time_t fileTime = mktime(&t);

            double days = difftime(now, fileTime) / 86400.0;
            if (days > MAX_DAYS_LOCAL) {
                LittleFS.remove(name);
            }
        }
        f = root.openNextFile();
    }
}
