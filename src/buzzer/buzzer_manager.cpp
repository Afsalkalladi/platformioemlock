#include "buzzer_manager.h"
#include "../config/config.h"
#include <Arduino.h>

// LEDC channel for buzzer PWM
#define BUZZER_CHANNEL  0
#define BUZZER_RESOLUTION 8

void BuzzerManager::init() {
    ledcSetup(BUZZER_CHANNEL, 2000, BUZZER_RESOLUTION);
    ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
    ledcWriteTone(BUZZER_CHANNEL, 0); // Start silent
    Serial.println("[BUZZER] Initialized on pin " + String(BUZZER_PIN));
}

// Helper to play a tone
static void playTone(uint32_t freq, uint32_t duration) {
    ledcWriteTone(BUZZER_CHANNEL, freq);
    delay(duration);
    ledcWriteTone(BUZZER_CHANNEL, 0);
}

// GRANT: Two ascending happy beeps (success sound)
void BuzzerManager::playGrantTone() {
    Serial.println("[BUZZER] GRANT");
    playTone(1000, 100);  // Low beep
    delay(50);
    playTone(1500, 150);  // Higher beep
}

// DENY: Three short descending harsh beeps (error/rejection)
void BuzzerManager::playDenyTone() {
    Serial.println("[BUZZER] DENY");
    playTone(800, 150);
    delay(50);
    playTone(600, 150);
    delay(50);
    playTone(400, 200);
}

// PENDING: Single medium beep (acknowledgment, awaiting decision)
void BuzzerManager::playPendingTone() {
    Serial.println("[BUZZER] PENDING");
    playTone(1200, 200);
}

// EXIT: Quick double chirp (door exit confirmation)
void BuzzerManager::playExitTone() {
    Serial.println("[BUZZER] EXIT");
    playTone(1800, 80);
    delay(40);
    playTone(1800, 80);
}

// REMOTE: Ascending melody (remote unlock notification)
void BuzzerManager::playRemoteTone() {
    Serial.println("[BUZZER] REMOTE");
    playTone(800, 100);
    delay(30);
    playTone(1200, 100);
    delay(30);
    playTone(1600, 150);
}

// INVALID: Long low buzz (invalid card format)
void BuzzerManager::playInvalid() {
    Serial.println("[BUZZER] INVALID");
    playTone(300, 400);
}
