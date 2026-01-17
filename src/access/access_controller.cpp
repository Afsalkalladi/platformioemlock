#include "access_controller.h"
#include "relay/relay_controller.h"
#include "buzzer/buzzer_manager.h"
#include <Arduino.h>

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

    switch (evt.type) {

        case EventType::EXIT_TRIGGERED:
            unlockDoor();
            BuzzerManager::playExitTone();
            break;

        case EventType::REMOTE_UNLOCK:
            unlockDoor();
            BuzzerManager::playRemoteTone();
            break;

        case EventType::RFID_GRANTED:
            unlockDoor();
            BuzzerManager::playGrantTone();
            break;

        case EventType::RFID_DENIED:
            BuzzerManager::playDenyTone();
            break;

        case EventType::RFID_PENDING:
            BuzzerManager::playPendingTone();
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
