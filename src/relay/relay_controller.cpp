#include "relay_controller.h"
#include <Arduino.h>

void RelayController::init() {
    // GPIO setup later
}

void RelayController::unlock() {
    Serial.println("[RELAY] UNLOCK");
}

void RelayController::lock() {
    Serial.println("[RELAY] LOCK");
}
