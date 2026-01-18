#pragma once

#include <stdint.h>

enum class EventType : uint8_t {
    NONE = 0,

    // Access events
    RFID_GRANTED,
    RFID_DENIED,
    RFID_PENDING,
    RFID_INVALID,

    EXIT_TRIGGERED,
    REMOTE_UNLOCK,

    // System / debug (future)
    SYSTEM_BOOT,
    WIFI_LOST,
    COMMAND_ERROR
};

struct Event {
    EventType type;
    char uid[21];   // empty for non-RFID events
};
