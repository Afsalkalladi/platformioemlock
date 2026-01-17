#pragma once

#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

// ================= EXIT EVENT =================

enum class ExitEventType : uint8_t {
    EXIT_TRIGGERED
};

struct ExitEvent {
    ExitEventType type;
};

// ================= EXIT SENSOR MANAGER =================

class ExitSensor {
public:
    static void init(uint8_t pin, QueueHandle_t eventQueue);
    static void poll();   // non-blocking, Core 1 only

private:
    static void emitEvent();
};
