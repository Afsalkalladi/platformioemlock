#pragma once
#include <Arduino.h>

enum class LogEvent : uint8_t {
    RFID_GRANTED,
    RFID_DENIED,
    RFID_PENDING,
    RFID_INVALID,
    EXIT_UNLOCK,
    REMOTE_UNLOCK,
    SYSTEM_BOOT,
    WIFI_LOST,
    UID_WHITELISTED,
    UID_BLACKLISTED,
    UID_REMOVED,
    COMMAND_ERROR
};

class LogStore {
public:
    static void init();

    static void log(LogEvent evt,
                    const char* uid = "-",
                    const char* info = "");

    static void cleanupOldLogs();   // >30 days
};
