#include <Arduino.h>
#include <FS.h>
#include <LittleFS.h>
#include <time.h>
#include "cloud/log_sync.h"

// ===== CORE =====
#include "core/event_types.h"
#include "core/event_queue.h"

// ===== ACCESS =====
#include "access/rfid_manager.h"
#include "access/access_controller.h"

// ===== HARDWARE =====
#include "relay/relay_controller.h"
#include "buzzer/buzzer_manager.h"

// ===== STORAGE =====
#include "storage/nvs_store.h"
#include "storage/log_store.h"

#include "cloud/wifi_manager.h"
// =====================================================
// CORE 1 TASK
// =====================================================
void core1_access_task(void* param) {
    Serial.println("[CORE1] Access task starting");

    // --- INIT MODULES (ONCE) ---
    RFIDManager::init(21, 22, nullptr);   // keep legacy RFID init
    AccessController::init();

    Serial.println("[CORE1] Access system initialized");

    static bool exitSimLatch = false;
    static uint32_t exitSimLatchTime = 0;
    const uint32_t EXIT_SIM_LATCH_MS = 300;

    while (true) {

        // 1️⃣ Poll RFID hardware
        RFIDManager::poll();

        // 2️⃣ Handle unified events
        Event evt;
        if (EventQueue::receive(evt)) {
            AccessController::handleEvent(evt);
        }

        // 3️⃣ Update access controller (timers / cooldown)
        AccessController::update();

        // 4️⃣ DEBUG: EXIT SIMULATION (PRESS 'E')
    // ---------------- DEBUG EXIT SIMULATION ----------------
 if (Serial.available()) {
            char c = Serial.read();
            if ((c == 'E' || c == 'e') && !exitSimLatch) {
                Event e{};
                e.type = EventType::EXIT_TRIGGERED;
                EventQueue::send(e);
                Serial.println("[SIM] EXIT_TRIGGERED");

                exitSimLatch = true;
                exitSimLatchTime = millis();
            }
        }

        if (exitSimLatch && millis() - exitSimLatchTime > EXIT_SIM_LATCH_MS) {
            exitSimLatch = false;
        }

        vTaskDelay(5 / portTICK_PERIOD_MS);



    }
}
// =====================================================
// SETUP
// =====================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n[BOOT] System starting");

    // --- INIT SHARED SYSTEMS ---
    EventQueue::init();
    RelayController::init();
    BuzzerManager::init();
    NVSStore::init();
    LogStore::init();
    WiFiManager::init();
    LogSync::init();




    // --- START CORE 1 TASK ---
    xTaskCreatePinnedToCore(
        core1_access_task,
        "core1_access",
        8192,
        nullptr,
        2,
        nullptr,
        1   // CORE 1
    );

    Serial.println("[MAIN] Core 1 access task created");

}

void loop() {
    WiFiManager::update();
    LogSync::update();

    static uint32_t lastPrint = 0;

    // ===== DEBUG: READ TODAY'S LOG FILE =====


if (Serial.available()) {
    char c = Serial.read();
    if (c == 'S' || c == 's') {
        LogSync::triggerSync();
    }
}




    vTaskDelay(100 / portTICK_PERIOD_MS);
}



