#pragma once

#include <stdint.h>
#include "core/event_types.h"

// ================= ACCESS CONTROLLER =================

class AccessController {
public:
    static void init();
    static void handleEvent(const Event& evt);
    static void update();   // called periodically (Core 1)

private:
    static void unlockDoor();
    static void lockDoor();

    static bool isCooldownActive();
};
