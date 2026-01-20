#include "access_controller.h"
#include "relay/relay_controller.h"
#include "buzzer/buzzer_manager.h"
#include <Arduino.h>
#include "storage/log_store.h"

// ================= TIMING =================

static const uint32_t UNLOCK_DURATION_MS = 5000;
static const uint32_t UNLOCK_COOLDOWN_MS = 4000;

// ================= STATE =================

static bool doorUnlocked = false;
static uint32_t unlockStartTime = 0;
static uint32_t lastUnlockTime = 0;

// ================= PUBLIC =================

void AccessController::init() {
    doorUnlocked = false;
    unlockStartTime = 0;
    lastUnlockTime = 0;

    RelayController::lock();
}

void AccessController::handleEvent(const Event& evt) {

    // Enforce cooldown
    if (isCooldownActive()) {
        Serial.println("[ACCESS] Cooldown active, event ignored");
        return;
    }
    // ===== RFID DEBUG VISIBILITY =====
if (evt.type == EventType::RFID_GRANTED ||
    evt.type == EventType::RFID_DENIED ||
    evt.type == EventType::RFID_PENDING ||
    evt.type == EventType::RFID_INVALID) {

    Serial.print("[RFID] UID=");
    Serial.print(evt.uid);
    Serial.print(" RESULT=");

    switch (evt.type) {
        case EventType::RFID_GRANTED: Serial.println("GRANTED"); break;
        case EventType::RFID_DENIED:  Serial.println("DENIED");  break;
        case EventType::RFID_PENDING: Serial.println("PENDING"); break;
        case EventType::RFID_INVALID: Serial.println("INVALID"); break;
        default: break;
    }
}



    switch (evt.type) {

        case EventType::EXIT_TRIGGERED:
            LogStore::log(LogEvent::EXIT_UNLOCK, "-", "ok");
            unlockDoor();
            BuzzerManager::playExitTone();
            break;

        case EventType::REMOTE_UNLOCK:
            LogStore::log(LogEvent::REMOTE_UNLOCK, "-", "ok");
            unlockDoor();
            BuzzerManager::playRemoteTone();
            break;

        case EventType::RFID_GRANTED:
            Serial.println("[RFID] CARD UID = " + String(evt.uid));
            LogStore::log(LogEvent::ACCESS_GRANTED, evt.uid, "ok");
            unlockDoor();
            BuzzerManager::playGrantTone();
            break;

        case EventType::RFID_DENIED:
            Serial.println("[RFID] CARD UID = " + String(evt.uid));
            LogStore::log(LogEvent::ACCESS_DENIED, evt.uid, "blacklist");
            BuzzerManager::playDenyTone();
            break;

        case EventType::RFID_PENDING:
            Serial.println("[RFID] CARD UID = " + String(evt.uid));
            LogStore::log(LogEvent::UNKNOWN_CARD, evt.uid, "pending");
            BuzzerManager::playPendingTone();
            break;
            
        case EventType::RFID_INVALID:
            Serial.println("[RFID] INVALID CARD");
            LogStore::log(LogEvent::RFID_INVALID, "-", "invalid UID");
            BuzzerManager::playInvalid();
            break;

        default:
            break;
    }
}

void AccessController::update() {
    uint32_t now = millis();

    if (doorUnlocked && (now - unlockStartTime >= UNLOCK_DURATION_MS)) {
        lockDoor();
        lastUnlockTime = now;
    }
}

// ================= PRIVATE =================

void AccessController::unlockDoor() {
    RelayController::unlock();
    doorUnlocked = true;
    unlockStartTime = millis();
    lastUnlockTime = millis();

    Serial.println("[ACCESS] Door UNLOCKED");
}

void AccessController::lockDoor() {
    RelayController::lock();
    doorUnlocked = false;
}

bool AccessController::isCooldownActive() {
    uint32_t now = millis();
    return (now - lastUnlockTime < UNLOCK_COOLDOWN_MS);
}
