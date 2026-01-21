#include "exit_sensor.h"
#include <Arduino.h>
#include "core/event_queue.h"
#include "core/event_types.h"

// ================= CONFIG =================

static uint8_t exitPin;

// Timing (LOCKED)
static const uint32_t EXIT_DEBOUNCE_MS = 80;
static const uint32_t EXIT_COOLDOWN_MS = 1000;

// ================= STATE =================

static bool lastStableState = LOW;     // current stable state
static bool debouncing = false;
static bool idleState = LOW;           // measured idle state at init
static bool activeState = HIGH;        // state representing "presence"

static uint32_t debounceStart = 0;
static uint32_t lastTriggerTime = 0;

// ================= PUBLIC =================

void ExitSensor::init(uint8_t pin) {
    exitPin = pin;

    pinMode(exitPin, INPUT);  // GPIO 35: input-only, no pullups

    // Measure idle level and compute active level (assume active is opposite)
    idleState = digitalRead(exitPin);
    activeState = !idleState;
    lastStableState = idleState;
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

    // Detect activation (idle -> active) and trigger immediately when active
    if (!debouncing) {
        if (currentState == activeState && lastStableState == idleState) {
            debouncing = true;
            debounceStart = now;
        }
    } else {
        // Debounce in progress
        if (currentState == activeState) {
            if (now - debounceStart >= EXIT_DEBOUNCE_MS) {
                // Valid exit trigger (presence detected)
                emitEvent();
                lastTriggerTime = now;

                debouncing = false;
                lastStableState = activeState;
            }
        } else {
            // Bounce/noise → cancel debounce
            debouncing = false;
        }
    }

    // Reset stable state back to idle when active clears
    if (lastStableState == activeState && currentState == idleState) {
        lastStableState = idleState;
    }
}

// ================= PRIVATE =================

void ExitSensor::emitEvent() {
    Event e{};
    e.type = EventType::EXIT_TRIGGERED;
    EventQueue::send(e);
}
