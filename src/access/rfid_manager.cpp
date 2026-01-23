#include "rfid_manager.h"
#include "core/event_queue.h"
#include "access/access_decision.h"

#include <MFRC522.h>
#include <SPI.h>
#include <string.h>
#include <ctype.h>
#include <Arduino.h>

// ================= HARDWARE CONFIG =================
static MFRC522 rfid(21, 22);   // SDA, RST

// ================= INTERNAL STATE =================
static const uint32_t RFID_COOLDOWN_MS = 1;

// Health monitoring state
static uint32_t lastSuccessfulReadMs = 0;
static uint32_t lastHealthCheckMs = 0;
static uint32_t pollCount = 0;

// Timing constants for health monitoring
static const uint32_t HEALTH_CHECK_INTERVAL_MS = 10000;  // Check health every 10 seconds
static const uint32_t READER_TIMEOUT_MS = 30000;         // Reinit if no reads for 30 seconds
static const uint32_t ANTENNA_CYCLE_INTERVAL_MS = 60000; // Cycle antenna every 60 seconds

static uint32_t lastAntennaCycleMs = 0;

// ================= PRIVATE HELPER FUNCTIONS =================

static bool performHealthCheck() {
    // Read the version register to verify communication
    byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    
    // Valid MFRC522/compatible versions:
    // 0x91 = MFRC522 v1.0
    // 0x92 = MFRC522 v2.0
    // 0x82 = FM17522 or compatible clone
    // 0x88 = FM17522E
    // 0x12 = Counterfeit (but often works)
    // 0x00 or 0xFF = Communication failure (not connected or broken)
    
    if (version == 0x00 || version == 0xFF) {
        Serial.printf("[RFID] Health check FAILED - No communication (0x%02X)\n", version);
        return false;
    }
    
    // Any other version means the chip is responding
    return true;
}

static void reinitReader() {
    Serial.println("[RFID] Reinitializing MFRC522...");
    
    // Full reinitialization sequence
    rfid.PCD_Reset();
    delay(50);
    rfid.PCD_Init();
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    
    // Reset timing counters
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs = millis();
    lastAntennaCycleMs = millis();
    
    Serial.println("[RFID] Reinit complete");
}

static void cycleAntenna() {
    // Briefly disable and re-enable antenna to prevent RF saturation
    rfid.PCD_AntennaOff();
    delayMicroseconds(100);
    rfid.PCD_AntennaOn();
}

// ================= PUBLIC FUNCTIONS =================

void RFIDManager::init(uint8_t ssPin, uint8_t rstPin) {
    SPI.begin(18, 19, 23, ssPin);   // SCK, MISO, MOSI, SS
    rfid.PCD_Init();
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    
    // Initialize timing state
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs = millis();
    lastAntennaCycleMs = millis();
    pollCount = 0;
    
    Serial.println("[RFID] MFRC522 initialized");
}

void RFIDManager::poll() {
    uint32_t now = millis();
    pollCount++;

    // ----- PERIODIC HEALTH CHECK -----
    if (now - lastHealthCheckMs >= HEALTH_CHECK_INTERVAL_MS) {
        lastHealthCheckMs = now;
        
        if (!performHealthCheck()) {
            reinitReader();
            return;  // Skip this poll cycle after reinit
        }
    }

    // NOTE: Removed the 30-second "no reads" timeout.
    // The health check above is sufficient to detect actual hardware failures.
    // The timeout was causing unnecessary reinits when no cards were being scanned.

    // ----- PERIODIC ANTENNA CYCLE -----
    if (now - lastAntennaCycleMs >= ANTENNA_CYCLE_INTERVAL_MS) {
        lastAntennaCycleMs = now;
        cycleAntenna();
    }

    // ----- CARD DETECTION -----
    // NOTE: Removed rfid.PCD_Init() - this was causing the freeze!
    
    if (!rfid.PICC_IsNewCardPresent()) {
        return;
    }
    Serial.println("[RFID] Card detected, reading serial...");
    if (!rfid.PICC_ReadCardSerial()) {
        Serial.println("[RFID] Failed to read card serial.");
        return;
    }
    
    // Mark successful read - this proves the reader is working!
    lastSuccessfulReadMs = millis();
    
    static uint32_t lastReadMs = 0;

    if (millis() - lastReadMs < RFID_COOLDOWN_MS) {
        Serial.println("[RFID] Cooldown active, ignoring scan.");
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }
    lastReadMs = millis();

    

    uint8_t len = rfid.uid.size;

    // No UID length restriction; scan all cards regardless of UID length

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