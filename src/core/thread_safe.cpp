#include "thread_safe.h"
#include <Arduino.h>

SemaphoreHandle_t ThreadSafe::mutex = nullptr;

void ThreadSafe::init() {
    if (mutex == nullptr) {
        mutex = xSemaphoreCreateMutex();
        if (mutex != nullptr) {
            Serial.println("[THREAD] Mutex initialized");
        } else {
            Serial.println("[THREAD] ERROR: Failed to create mutex!");
        }
    }
}

bool ThreadSafe::lock(uint32_t timeoutMs) {
    if (mutex == nullptr) {
        Serial.println("[THREAD] WARNING: Mutex not initialized, skipping lock");
        return false;
    }
    
    TickType_t ticks = (timeoutMs == portMAX_DELAY) ? portMAX_DELAY : pdMS_TO_TICKS(timeoutMs);
    return xSemaphoreTake(mutex, ticks) == pdTRUE;
}

void ThreadSafe::unlock() {
    if (mutex != nullptr) {
        xSemaphoreGive(mutex);
    }
}
