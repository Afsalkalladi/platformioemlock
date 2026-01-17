#include "exit_sensor.h"
#include <Arduino.h>

// ================= CONFIG =================

static uint8_t exitPin;
static QueueHandle_t exitQueue = nullptr;

// Timing (LOCKED)
static const uint32_t EXIT_DEBOUNCE_MS = 80;
static const uint32_t EXIT_COOLDOWN_MS = 4000;

// ================= STATE =================

static bool lastStableState = LOW;     // NC sensor idle = LOW
static bool debouncing = false;

static uint32_t debounceStart = 0;
static uint32_t lastTriggerTime = 0;

// ================= PUBLIC =================

void ExitSensor::init(uint8_t pin, QueueHandle_t eventQueue) {
    exitPin = pin;
    exitQueue = eventQueue;

    pinMode(exitPin, INPUT);  // GPIO 35: input-only, no pullups

    lastStableState = digitalRead(exitPin);
    lastTriggerTime = 0;

    Serial.println("[EXIT] Exit sensor initialized");
}

void ExitSensor::poll() {
    uint32_t now = millis();

    // Enforce cooldown
    if (now - lastTriggerTime < EXIT_COOLDOWN_MS) {
        return;
    }

    bool currentState = digitalRead(exitPin);

    // Detect rising edge (LOW → HIGH)
    if (!debouncing) {
        if (lastStableState == LOW && currentState == HIGH) {
            debouncing = true;
            debounceStart = now;
        }
    } else {
        // Debounce in progress
        if (currentState == HIGH) {
            if (now - debounceStart >= EXIT_DEBOUNCE_MS) {
                // Valid exit trigger
                emitEvent();
                lastTriggerTime = now;

                debouncing = false;
                lastStableState = HIGH;
            }
        } else {
            // Bounce/noise → cancel debounce
            debouncing = false;
        }
    }

    // Reset stable state when signal goes LOW again
    if (lastStableState == HIGH && currentState == LOW) {
        lastStableState = LOW;
    }
}

// ================= PRIVATE =================

void ExitSensor::emitEvent() {
    if (!exitQueue) return;

    ExitEvent evt;
    evt.type = ExitEventType::EXIT_TRIGGERED;

    xQueueSend(exitQueue, &evt, 0);
}
