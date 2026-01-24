#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// ========== GLOBAL MUTEX FOR SHARED RESOURCES ==========
// This mutex protects LittleFS and NVS access from both cores

class ThreadSafe {
public:
    static void init();
    
    // Take mutex before accessing shared resources (LittleFS, NVS)
    static bool lock(uint32_t timeoutMs = 100);
    
    // Release mutex after accessing shared resources
    static void unlock();
    
    // RAII lock guard
    class Guard {
    public:
        Guard(uint32_t timeoutMs = 100) : acquired(ThreadSafe::lock(timeoutMs)) {}
        ~Guard() { if (acquired) ThreadSafe::unlock(); }
        bool isAcquired() const { return acquired; }
    private:
        bool acquired;
    };
    
private:
    static SemaphoreHandle_t mutex;
};
