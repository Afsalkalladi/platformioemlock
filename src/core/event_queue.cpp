#include "event_queue.h"

QueueHandle_t EventQueue::queue = nullptr;

void EventQueue::init() {
    if (queue == nullptr) {
        queue = xQueueCreate(10, sizeof(Event));
    }
}

bool EventQueue::send(const Event& evt) {
    if (!queue) return false;
    return xQueueSend(queue, &evt, 0) == pdTRUE;
}

bool EventQueue::receive(Event& evt) {
    if (!queue) return false;
    return xQueueReceive(queue, &evt, 0) == pdTRUE;
}
