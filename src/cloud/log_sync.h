#pragma once
#include <Arduino.h>

class LogSync {
public:
    static void init();
    static void triggerSync();     // called by admin command (serial debug)
    static void update();          // Core 0 loop - handles scheduled sync
    static bool isSyncing();
    static void triggerAutoSync(); // Direct cloud sync (bypass command queue)
};
