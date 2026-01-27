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

// RFID Health Information
struct RFIDHealth {
    bool communicationOk;
    bool antennaOn;
    uint8_t version;
    uint8_t antennaGain;
    uint8_t txControl;
    uint8_t status1;
    uint8_t status2;
    uint8_t comIrq;
    uint32_t pollCount;
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
