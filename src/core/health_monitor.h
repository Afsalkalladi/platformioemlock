#pragma once
#include <Arduino.h>
#include "esp_system.h"

namespace HealthMonitor {

  void begin();
  void update();

  uint32_t freeHeap();
  uint32_t minFreeHeap();
  uint32_t uptimeSec();

  esp_reset_reason_t lastResetReason();
}
