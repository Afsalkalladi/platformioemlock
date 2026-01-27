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
static const uint32_t RFID_COOLDOWN_MS = 500;  // Prevent rapid re-reads

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
    delay(100);  // Longer delay for reset to complete
    rfid.PCD_Init();
    delay(10);   // Allow init to stabilize
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    rfid.PCD_AntennaOn();  // Ensure antenna is on
    
    // Reset timing counters
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs = millis();
    lastAntennaCycleMs = millis();
    
    // Verify reinit worked
    byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (version == 0x00 || version == 0xFF) {
        Serial.println("[RFID] WARNING: Reinit failed - still no communication");
    } else {
        Serial.printf("[RFID] Reinit complete (version: 0x%02X)\n", version);
    }
}

static void cycleAntenna() {
    // Briefly disable and re-enable antenna to prevent RF saturation
    rfid.PCD_AntennaOff();
    delayMicroseconds(100);
    rfid.PCD_AntennaOn();
}

// ================= PUBLIC FUNCTIONS =================

void RFIDManager::init(uint8_t ssPin, uint8_t rstPin) {
    Serial.println("[RFID] Initializing MFRC522...");
    
    SPI.begin(18, 19, 23, ssPin);   // SCK, MISO, MOSI, SS
    rfid.PCD_Init();
    delay(10);  // Allow chip to stabilize
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    
    // Initialize timing state
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs = millis();
    lastAntennaCycleMs = millis();
    pollCount = 0;
    
    // Read and display diagnostics
    byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    byte gain = rfid.PCD_ReadRegister(MFRC522::RFCfgReg) & 0x70;
    byte txControl = rfid.PCD_ReadRegister(MFRC522::TxControlReg);
    byte status1 = rfid.PCD_ReadRegister(MFRC522::Status1Reg);
    byte status2 = rfid.PCD_ReadRegister(MFRC522::Status2Reg);
    byte comIrq = rfid.PCD_ReadRegister(MFRC522::ComIrqReg);
    
    Serial.println("======== RFID DIAGNOSTICS ========");
    Serial.printf("  Uptime: %lu seconds\n", millis() / 1000);
    Serial.printf("  Version: 0x%02X\n", version);
    Serial.printf("  Antenna Gain: 0x%02X (max=0x70)\n", gain);
    Serial.printf("  TxControl: 0x%02X (antenna %s)\n", txControl, (txControl & 0x03) ? "ON" : "OFF");
    Serial.printf("  Status1: 0x%02X, Status2: 0x%02X\n", status1, status2);
    Serial.printf("  ComIrq: 0x%02X\n", comIrq);
    Serial.println("==================================");
    
    // Check for critical issues
    if (version == 0x00 || version == 0xFF) {
        Serial.println("[RFID] WARNING: No communication with MFRC522 - check wiring!");
    } else if ((txControl & 0x03) == 0) {
        Serial.println("[RFID] WARNING: Antenna is OFF - enabling...");
        rfid.PCD_AntennaOn();
    }
    
    Serial.println("[RFID] Initialization complete");
}

void RFIDManager::poll() {
    uint32_t now = millis();
    pollCount++;

    // ----- PERIODIC HEALTH CHECK -----
    if (now - lastHealthCheckMs >= HEALTH_CHECK_INTERVAL_MS) {
        lastHealthCheckMs = now;
        
        if (!performHealthCheck()) {
            Serial.println("[RFID] Health check failed, reinitializing...");
            reinitReader();
            return;  // Skip this poll cycle after reinit
        }
    }

    // ----- WATCHDOG: Reinit if reader hasn't responded in a while -----
    // Only trigger if we've had successful reads before (proves reader was working)
    if (lastSuccessfulReadMs > 0 && (now - lastSuccessfulReadMs > READER_TIMEOUT_MS)) {
        Serial.println("[RFID] Watchdog: No successful reads for 30s, reinitializing...");
        reinitReader();
        return;
    }

    // ----- PERIODIC ANTENNA CYCLE -----
    if (now - lastAntennaCycleMs >= ANTENNA_CYCLE_INTERVAL_MS) {
        lastAntennaCycleMs = now;
        cycleAntenna();
        delay(10);  // Small delay after antenna cycle
    }

    // ----- CARD DETECTION -----
    // NOTE: Removed rfid.PCD_Init() - this was causing the freeze!
    
    // Check if card is present (non-blocking)
    if (!rfid.PICC_IsNewCardPresent()) {
        return;
    }
    
    // Additional check: verify card is still in range
    if (!rfid.PICC_ReadCardSerial()) {
        Serial.println("[RFID] Card detected but failed to read serial.");
        // Clean up failed read attempt
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        delay(10);  // Small delay to let reader recover
        return;
    }
    
    // Mark successful read - this proves the reader is working!
    lastSuccessfulReadMs = millis();
    
    static uint32_t lastReadMs = 0;

    if (millis() - lastReadMs < RFID_COOLDOWN_MS) {
        Serial.println("[RFID] Cooldown active, ignoring scan.");
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        delay(10);  // Small delay to let reader recover
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

    // Clean up card communication properly
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    
    // Small delay to let reader fully recover before next poll
    delay(20);
}

RFIDHealth RFIDManager::getHealth() {
    RFIDHealth health = {};
    
    // Read version to check communication
    health.version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    health.communicationOk = (health.version != 0x00 && health.version != 0xFF);
    
    if (health.communicationOk) {
        // Read antenna and status registers
        health.antennaGain = rfid.PCD_ReadRegister(MFRC522::RFCfgReg) & 0x70;
        health.txControl = rfid.PCD_ReadRegister(MFRC522::TxControlReg);
        health.antennaOn = (health.txControl & 0x03) != 0;
        health.status1 = rfid.PCD_ReadRegister(MFRC522::Status1Reg);
        health.status2 = rfid.PCD_ReadRegister(MFRC522::Status2Reg);
        health.comIrq = rfid.PCD_ReadRegister(MFRC522::ComIrqReg);
    } else {
        // Communication failed - set defaults
        health.antennaGain = 0;
        health.txControl = 0;
        health.antennaOn = false;
        health.status1 = 0;
        health.status2 = 0;
        health.comIrq = 0;
    }
    
    health.pollCount = pollCount;
    
    return health;
}