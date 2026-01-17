#include "health_monitor.h"
#include "../config/config.h"

namespace HealthMonitor {

  static uint32_t minHeapSeen = UINT32_MAX;
  static uint32_t bootTimeMs = 0;
  static esp_reset_reason_t resetReason;

  void begin() {
    bootTimeMs = millis();
    resetReason = esp_reset_reason();

    uint32_t heap = ESP.getFreeHeap();
    minHeapSeen = heap;

#if DEBUG_SERIAL
    Serial.println("=== HEALTH MONITOR INIT ===");
    Serial.print("Reset reason: ");
    Serial.println(resetReason);
    Serial.print("Initial free heap: ");
    Serial.println(heap);
#endif
  }

  void update() {
    uint32_t heap = ESP.getFreeHeap();
    if (heap < minHeapSeen) {
      minHeapSeen = heap;
    }
  }

  uint32_t freeHeap() {
    return ESP.getFreeHeap();
  }

  uint32_t minFreeHeap() {
    return minHeapSeen;
  }

  uint32_t uptimeSec() {
    return (millis() - bootTimeMs) / 1000;
  }

  esp_reset_reason_t lastResetReason() {
    return resetReason;
  }

}
