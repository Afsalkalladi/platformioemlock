#include <Arduino.h>
#include "config/config.h"
#include "core/health_monitor.h"
#include "storage/nvs_store.h"
#include "access/access_decision.h"
#include "access/rfid_manager.h"
#include "access/exit_sensor.h"
#include "access/exit_sensor.h"



unsigned long lastHealthPrint = 0;
// Queue used by Core 1 to receive RFID events
QueueHandle_t rfidEventQueue = nullptr;
QueueHandle_t exitEventQueue = xQueueCreate(5, sizeof(ExitEvent));
void core1_access_task(void* param);


void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("[BOOT] System starting");

    xTaskCreatePinnedToCore(
        core1_access_task,     // function
        "core1_access",        // name
        4096,                  // stack size
        nullptr,               // param
        2,                     // priority (higher than idle)
        nullptr,               // task handle (not needed now)
        1                      // CORE 1 (THIS IS CRITICAL)
    );
    Serial.println("[MAIN] Core 1 access task created");
}

void loop() {
    // Empty by design
    vTaskDelay(1000 / portTICK_PERIOD_MS);

}

void core1_access_task(void* param) {
    Serial.println("[CORE1] Access task starting");

    // -------------------------------
    // 1️⃣ CREATE THE RFID EVENT QUEUE
    // -------------------------------
    rfidEventQueue = xQueueCreate(
        10,                 // max 10 pending RFID events
        sizeof(RFIDEvent)   // size of each event
    );
    exitEventQueue = xQueueCreate(5, sizeof(ExitEvent));

    if (rfidEventQueue == nullptr) {
        Serial.println("[CORE1][FATAL] RFID queue creation failed");
        vTaskDelete(nullptr); // kill task, system is broken
    }



    // -------------------------------
    // 2️⃣ INITIALIZE RFID MANAGER
    // -------------------------------
    RFIDManager::init(
        21,   // SDA / SS
        22,   // RST
        rfidEventQueue
    );

    Serial.println("[CORE1] RFID Manager initialized");

    // -------------------------------
    // 3️⃣ MAIN REAL-TIME LOOP
    // -------------------------------
    while (true) {

        // 3.1 Poll RFID hardware (non-blocking)
        RFIDManager::poll();

        // 3.2 Check if any RFID event arrived
        RFIDEvent evt;
        if (xQueueReceive(rfidEventQueue, &evt, 0) == pdTRUE) {

            // TEMPORARY TEST OUTPUT (WILL BE REMOVED LATER)
            Serial.print("[RFID EVENT] ");

            if (evt.type == RFIDEventType::CARD_DETECTED) {
                Serial.print("CARD ");
            } else {
                Serial.print("INVALID ");
            }
        }
         ExitEvent exitEvt;
        if (xQueueReceive(exitEventQueue, &exitEvt, 0) == pdTRUE) {
            Serial.println("[EXIT EVENT] EXIT_TRIGGERED");
        }

        // ---------------- DEBUG EXIT SIMULATION ----------------
        if (Serial.available()) {
            char c = Serial.read();
            if (c == 'E' || c == 'e') {
                ExitEvent simEvt;
                simEvt.type = ExitEventType::EXIT_TRIGGERED;
                xQueueSend(exitEventQueue, &simEvt, 0);
                Serial.println("[DEBUG] Simulated EXIT_TRIGGERED");
            }
        }
        // 3.3 Small yield to RTOS (NOT delay)
        vTaskDelay(5 / portTICK_PERIOD_MS);
    }
}


