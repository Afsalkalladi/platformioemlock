#pragma once
#include <Arduino.h>

class LogSync {
public:
    static void init();
    static void triggerSync();     // called by admin command
    static void update();          // Core 0 loop
    static bool isSyncing();
};
