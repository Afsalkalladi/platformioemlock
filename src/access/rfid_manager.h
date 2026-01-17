#pragma once

#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

// ================= RFID EVENT TYPES =================

enum class RFIDEventType : uint8_t {
    CARD_DETECTED,
    INVALID_UID
};

// ================= RFID EVENT STRUCT =================

struct RFIDEvent {
    RFIDEventType type;
    char uid[21];   // Max 20 hex chars + null terminator
};

// ================= RFID MANAGER INTERFACE =================

class RFIDManager {
public:
    static void init(uint8_t ssPin, uint8_t rstPin, QueueHandle_t eventQueue);
    static void poll();   // Non-blocking, called repeatedly on Core 1

private:
    static void emitEvent(RFIDEventType type, const char* uid);
    static bool isValidUID(const char* uid);
};
