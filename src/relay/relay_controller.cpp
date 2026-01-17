#include "relay_controller.h"
#include <Arduino.h>

// ================= CONFIG =================
static const uint8_t RELAY_PIN = 25;

// Change this if your relay is active HIGH
static const uint8_t RELAY_ACTIVE_LEVEL = HIGH;
static const uint8_t RELAY_INACTIVE_LEVEL = LOW;

// ================= STATE =================
static bool relayInitialized = false;

// ================= PUBLIC =================

void RelayController::init() {
    pinMode(RELAY_PIN, OUTPUT);

    // FAIL-SAFE: lock door immediately on boot
    digitalWrite(RELAY_PIN, RELAY_INACTIVE_LEVEL);

    relayInitialized = true;
    Serial.println("[RELAY] LOCK (boot default)");
}

void RelayController::unlock() {
    if (!relayInitialized) return;

    digitalWrite(RELAY_PIN, RELAY_ACTIVE_LEVEL);
    Serial.println("[RELAY] UNLOCK");
}

void RelayController::lock() {
    if (!relayInitialized) return;

    digitalWrite(RELAY_PIN, RELAY_INACTIVE_LEVEL);
    Serial.println("[RELAY] LOCK");
}
