#include "rfid_manager.h"

#include <MFRC522.h>
#include <SPI.h>
#include <string.h>
#include <ctype.h>
#include <Arduino.h>

// ================= HARDWARE CONFIG =================
static MFRC522 rfid(21, 22);   // SDA, RST

// ================= INTERNAL STATE =================
static QueueHandle_t rfidQueue = nullptr;

static uint32_t lastReadMillis = 0;
static char lastUID[21] = {0};

static const uint32_t RFID_COOLDOWN_MS = 1000;

// ================= PUBLIC FUNCTIONS =================

void RFIDManager::init(uint8_t ssPin, uint8_t rstPin, QueueHandle_t eventQueue) {
    rfidQueue = eventQueue;

    SPI.begin(18, 19, 23, ssPin);   // SCK, MISO, MOSI, SS
    rfid.PCD_Init();

    Serial.println("[RFID] MFRC522 initialized");
}

void RFIDManager::poll() {
    if (!rfid.PICC_IsNewCardPresent()) return;
    if (!rfid.PICC_ReadCardSerial()) return;

    uint32_t now = millis();

    // Cooldown check
    if (now - lastReadMillis < RFID_COOLDOWN_MS) {
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    char uidStr[21] = {0};
    uint8_t len = rfid.uid.size;

    // Only allow 4 or 7 byte UIDs
    if (!(len == 4 || len == 7)) {
        emitEvent(RFIDEventType::INVALID_UID, "LEN_ERR");
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    // Convert UID to hex string
    for (uint8_t i = 0; i < len; i++) {
        sprintf(&uidStr[i * 2], "%02X", rfid.uid.uidByte[i]);
    }

    if (!isValidUID(uidStr)) {
        emitEvent(RFIDEventType::INVALID_UID, uidStr);
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    // Ignore repeated UID
    if (strcmp(uidStr, lastUID) == 0) {
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    strcpy(lastUID, uidStr);
    lastReadMillis = now;

    emitEvent(RFIDEventType::CARD_DETECTED, uidStr);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
}

// ================= PRIVATE FUNCTIONS =================

void RFIDManager::emitEvent(RFIDEventType type, const char* uid) {
    if (!rfidQueue) return;

    RFIDEvent event;
    event.type = type;
    strncpy(event.uid, uid, sizeof(event.uid) - 1);

    xQueueSend(rfidQueue, &event, 0);
}

bool RFIDManager::isValidUID(const char* uid) {
    size_t len = strlen(uid);

    if (len < 8 || len > 20) return false;
    if (len % 2 != 0) return false;

    for (size_t i = 0; i < len; i++) {
        if (!isxdigit(uid[i])) return false;
    }
    return true;
}
