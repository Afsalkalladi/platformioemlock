#include "rfid_manager.h"

#include <MFRC522.h>
#include <SPI.h>
#include <string.h>
#include <ctype.h>
#include <Arduino.h>

// ================= HARDWARE CONFIG =================
static MFRC522 rfid(21, 22);   // SDA, RST

// ================= INTERNAL STATE =================


static const uint32_t RFID_COOLDOWN_MS = 1000;

// ================= PUBLIC FUNCTIONS =================

void RFIDManager::init(uint8_t ssPin, uint8_t rstPin) {

    SPI.begin(18, 19, 23, ssPin);   // SCK, MISO, MOSI, SS
    rfid.PCD_Init();

    Serial.println("[RFID] MFRC522 initialized");
}

#include "rfid_manager.h"
#include "core/event_queue.h"
#include "access/access_decision.h"

void RFIDManager::poll() {

    if (!rfid.PICC_IsNewCardPresent()) return;
    if (!rfid.PICC_ReadCardSerial()) return;
    static uint32_t lastReadMs = 0;

if (millis() - lastReadMs < RFID_COOLDOWN_MS) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
}
lastReadMs = millis();

    

    uint8_t len = rfid.uid.size;

    // Only allow 4 or 7 byte UIDs
    if (!(len == 4 || len == 7)) {
        Event evt{};
        evt.type = EventType::RFID_INVALID;
        EventQueue::send(evt);

        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    // Convert UID to hex string
    char uidStr[15] = {0}; // 7 bytes → 14 hex + null
    for (uint8_t i = 0; i < len; i++) {
        sprintf(uidStr + (i * 2), "%02X", rfid.uid.uidByte[i]);
    }
    Serial.printf("[RFID] UID=%s\n", uidStr);
    // ---- ACCESS DECISION ----
    AccessResult result = AccessDecision::evaluate(String(uidStr));

    Event evt{};
    strncpy(evt.uid, uidStr, sizeof(evt.uid) - 1);

    switch (result) {
        case AccessResult::GRANT:
            evt.type = EventType::RFID_GRANTED;
            break;

        case AccessResult::DENY_BLACKLIST:
            evt.type = EventType::RFID_DENIED;
            break;

         case AccessResult::PENDING_NEW:
            Serial.printf("[RFID] UID %s → PENDING (NEW)\n", uidStr);
            evt.type = EventType::RFID_PENDING;
            break;

        case AccessResult::PENDING_REPEAT:
             Serial.printf("[RFID] UID %s → PENDING (REPEAT)\n", uidStr);
            evt.type = EventType::RFID_PENDING;
            break;

        case AccessResult::INVALID:
        default:
            evt.type = EventType::RFID_INVALID;
            break;
    }

    EventQueue::send(evt);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
}