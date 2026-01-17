#include "buzzer_manager.h"
#include <Arduino.h>

void BuzzerManager::init() {}

void BuzzerManager::playGrantTone() {
    Serial.println("[BUZZER] GRANT");
}

void BuzzerManager::playDenyTone() {
    Serial.println("[BUZZER] DENY");
}

void BuzzerManager::playPendingTone() {
    Serial.println("[BUZZER] PENDING");
}

void BuzzerManager::playExitTone() {
    Serial.println("[BUZZER] EXIT");
}

void BuzzerManager::playRemoteTone() {
    Serial.println("[BUZZER] REMOTE");
}
