#include "rfid_manager.h"
#include "core/event_queue.h"
#include "access/access_decision.h"

#include <Adafruit_PN532.h>
#include <SPI.h>
#include <string.h>
#include <ctype.h>
#include <Arduino.h>

// ================= HARDWARE CONFIG =================
// PN532 over SPI – SS and RST pins passed at init()
static Adafruit_PN532* pn532 = nullptr;
static uint8_t _ssPin = 21;
static uint8_t _rstPin = 22;

// ================= INTERNAL STATE =================
static const uint32_t RFID_COOLDOWN_MS = 500;  // Prevent rapid re-reads

// Health monitoring state
static uint32_t lastSuccessfulReadMs = 0;
static uint32_t lastHealthCheckMs = 0;
static uint32_t pollCount = 0;
static uint32_t reinitCount = 0;

// Cached firmware info
static uint8_t cachedIC = 0;
static uint8_t cachedVerMaj = 0;
static uint8_t cachedVerMin = 0;
static uint8_t cachedSupport = 0;
static bool    samOk = false;

// Timing constants for health monitoring
static const uint32_t HEALTH_CHECK_INTERVAL_MS = 10000;  // Check health every 10 seconds
static const uint32_t READER_TIMEOUT_MS = 30000;          // Reinit if no reads for 30 seconds

// ================= PRIVATE HELPER FUNCTIONS =================

static bool readFirmwareVersion() {
    uint32_t versiondata = pn532->getFirmwareVersion();
    if (!versiondata) return false;

    cachedIC      = (versiondata >> 24) & 0xFF;
    cachedVerMaj  = (versiondata >> 16) & 0xFF;
    cachedVerMin  = (versiondata >>  8) & 0xFF;
    cachedSupport = versiondata & 0xFF;
    return true;
}

static bool performHealthCheck() {
    // getFirmwareVersion() returns 0 on communication failure
    uint32_t ver = pn532->getFirmwareVersion();
    if (!ver) {
        Serial.println("[RFID] Health check FAILED - no communication with PN532");
        samOk = false;
        return false;
    }
    samOk = true;
    return true;
}

static void reinitReader() {
    Serial.println("[RFID] Reinitializing PN532...");
    reinitCount++;

    // Hardware reset via RST pin
    digitalWrite(_rstPin, LOW);
    delay(100);
    digitalWrite(_rstPin, HIGH);
    delay(150);

    pn532->begin();

    if (!readFirmwareVersion()) {
        Serial.println("[RFID] WARNING: Reinit failed - still no communication");
        samOk = false;
        return;
    }

    // Configure as NFC tag reader
    pn532->SAMConfig();
    samOk = true;

    // Reset timing counters
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs = millis();

    Serial.printf("[RFID] Reinit complete  IC=0x%02X  FW=%d.%d\n",
                  cachedIC, cachedVerMaj, cachedVerMin);
}

// ================= PUBLIC FUNCTIONS =================

void RFIDManager::init(uint8_t ssPin, uint8_t rstPin) {
    _ssPin  = ssPin;
    _rstPin = rstPin;

    Serial.println("[RFID] Initializing PN532 (SPI)...");

    // RST pin - active-low reset
    pinMode(_rstPin, OUTPUT);
    digitalWrite(_rstPin, HIGH);

    // Create PN532 driver (hardware SPI, SS pin)
    static Adafruit_PN532 instance(_ssPin);
    pn532 = &instance;

    pn532->begin();

    // Initialize timing state
    lastSuccessfulReadMs = millis();
    lastHealthCheckMs    = millis();
    pollCount            = 0;
    reinitCount          = 0;

    // Read firmware info
    if (!readFirmwareVersion()) {
        Serial.println("[RFID] WARNING: No communication with PN532 - check wiring!");
        samOk = false;
    } else {
        Serial.println("======== RFID DIAGNOSTICS (PN532) ========");
        Serial.printf("  IC      : 0x%02X (expect 0x32)\n", cachedIC);
        Serial.printf("  Firmware: %d.%d\n", cachedVerMaj, cachedVerMin);
        Serial.printf("  Support : 0x%02X\n", cachedSupport);
        Serial.println("===========================================");

        // Configure as passive NFC tag reader
        pn532->SAMConfig();
        samOk = true;
    }

    Serial.println("[RFID] Initialization complete");
}

void RFIDManager::poll() {
    if (!pn532) return;

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
    if (lastSuccessfulReadMs > 0 && (now - lastSuccessfulReadMs > READER_TIMEOUT_MS)) {
        Serial.println("[RFID] Watchdog: No successful reads for 30s, reinitializing...");
        reinitReader();
        return;
    }

    // ----- CARD DETECTION (non-blocking, short timeout) -----
    uint8_t uid[7] = {0};
    uint8_t uidLen  = 0;

    // readPassiveTargetID with a very short timeout keeps polling non-blocking
    bool success = pn532->readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 50);

    if (!success) return;

    // Mark successful read - proves reader is working
    lastSuccessfulReadMs = millis();

    // ----- COOLDOWN -----
    static uint32_t lastReadMs = 0;
    if (millis() - lastReadMs < RFID_COOLDOWN_MS) {
        Serial.println("[RFID] Cooldown active, ignoring scan.");
        return;
    }
    lastReadMs = millis();

    // ----- CONVERT UID TO HEX -----
    char uidStr[15] = {0};  // 7 bytes -> 14 hex + null
    for (uint8_t i = 0; i < uidLen && i < 7; i++) {
        sprintf(uidStr + (i * 2), "%02X", uid[i]);
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
            Serial.printf("[RFID] UID %s -> PENDING (NEW)\n", uidStr);
            evt.type = EventType::RFID_PENDING;
            break;

        case AccessResult::PENDING_REPEAT:
            Serial.printf("[RFID] UID %s -> PENDING (REPEAT)\n", uidStr);
            evt.type = EventType::RFID_PENDING;
            break;

        case AccessResult::INVALID:
        default:
            evt.type = EventType::RFID_INVALID;
            break;
    }

    EventQueue::send(evt);

    // Small delay to let reader recover before next poll
    delay(20);
}

RFIDHealth RFIDManager::getHealth() {
    RFIDHealth h = {};

    if (!pn532) {
        h.communicationOk = false;
        h.pollCount       = pollCount;
        h.reinitCount     = reinitCount;
        return h;
    }

    // IMPORTANT: Do NOT call pn532->getFirmwareVersion() here!
    // getHealth() is called from Core 0 (HealthMonitor), while poll()
    // runs on Core 1 using the same SPI bus.  Issuing SPI commands from
    // both cores simultaneously corrupts the bus, causing:
    //   1) Health check always reports "Failed"
    //   2) Card reads return garbage UIDs → phantom pending entries
    // Instead, return the cached values that poll() already maintains.
    h.communicationOk    = samOk;  // updated by init() and reinitReader()
    h.samConfigured      = samOk;
    h.ic                 = cachedIC;
    h.firmwareVersionMaj = cachedVerMaj;
    h.firmwareVersionMin = cachedVerMin;
    h.firmwareSupport    = cachedSupport;
    h.pollCount          = pollCount;
    h.reinitCount        = reinitCount;

    return h;
}
