#include <Arduino.h>
#include "esp_system.h"

void setup() {
  Serial.begin(115200);
  delay(500);

  esp_reset_reason_t reason = esp_reset_reason();

  Serial.println("=== SYSTEM BOOT ===");
  Serial.print("Reset reason: ");
  Serial.println(reason);
}

void loop() {
  delay(1000);
}
