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

// RFID Health Information (PN532)
struct RFIDHealth {
    bool communicationOk;       // Can talk to PN532 over SPI
    bool samConfigured;         // SAM configuration succeeded
    uint8_t ic;                 // PN532 IC code (should be 0x32)
    uint8_t firmwareVersionMaj; // Firmware major version
    uint8_t firmwareVersionMin; // Firmware minor version
    uint8_t firmwareSupport;    // Firmware supported features bitmask
    uint32_t pollCount;         // Total poll() invocations
    uint32_t reinitCount;       // How many times we reinitialized
};

class RFIDManager {
public:
    static void init(uint8_t ssPin, uint8_t rstPin);
    static void poll();   // Non-blocking, called repeatedly on Core 1
    static RFIDHealth getHealth();  // Get current RFID health status

private:
    static void emitEvent(RFIDEventType type, const char* uid);
    static bool isValidUID(const char* uid);
};
