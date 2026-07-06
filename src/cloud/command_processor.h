#pragma once

class CommandProcessor {
public:
    static void init();
    static void update();
    static void pollNow();   // called by RealtimeClient on push - poll immediately
};
