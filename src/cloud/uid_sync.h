#pragma once

class UIDSync {
public:
    static void init();
    static void update();        // called from loop()
    static void trigger();       // manual trigger
};
