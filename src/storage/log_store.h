#pragma once
#include <Arduino.h>
#include <functional>

enum class LogEvent : uint8_t {
    ACCESS_GRANTED = 0,  // Whitelisted card
    ACCESS_DENIED = 1,   // Blacklisted card
    UNKNOWN_CARD = 2,    // Pending card
    RFID_INVALID = 3,
    EXIT_UNLOCK = 4,
    REMOTE_UNLOCK = 5,
    SYSTEM_BOOT = 6,
    WIFI_LOST = 7,
    UID_WHITELISTED = 8,
    UID_BLACKLISTED = 9,
    UID_REMOVED = 10,
    UID_SYNC = 11,
    COMMAND_ERROR = 12
};

struct LogEntry {
    uint32_t timestamp;
    LogEvent event;
    char uid[16];
    char info[32];
    char timestampStr[30];  // Original timestamp string with timezone for syncing
};

class LogStore {
public:
    static void init();

    static void log(LogEvent evt,
                    const char* uid = "-",
                    const char* info = "");

    static void forEach(std::function<void(const LogEntry&)> callback);
    static void cleanupOldLogs();   // >30 days
    static void clearAllLogs();     // Delete all log files after successful sync
};
