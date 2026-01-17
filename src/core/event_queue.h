#pragma once

#include "core/event_types.h"
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

class EventQueue {
public:
    static void init();
    static bool send(const Event& evt);
    static bool receive(Event& evt);

private:
    static QueueHandle_t queue;
};
