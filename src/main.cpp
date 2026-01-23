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
#include "access/exit_sensor.h"
#include "config/config.h"

// ===== HARDWARE =====
#include "relay/relay_controller.h"
#include "buzzer/buzzer_manager.h"

// ===== STORAGE =====
#include "storage/nvs_store.h"
#include "storage/log_store.h"

#include "cloud/wifi_manager.h"
#include "cloud/command_processor.h"
#include <WiFi.h>
// =====================================================
// CORE 1 TASK
// =====================================================
void core1_access_task(void* param) {
    Serial.println("[CORE1] Access task starting");

    // --- INIT MODULES (ONCE) ---
    RFIDManager::init(21, 22);   // keep legacy RFID init
    AccessController::init();

    Serial.println("[CORE1] Access system initialized");

    static bool exitSimLatch = false;
    static uint32_t exitSimLatchTime = 0;
    const uint32_t EXIT_SIM_LATCH_MS = 300;

    while (true) {

        // Poll exit sensor (physical)
        ExitSensor::poll();

        // 1️⃣ Poll RFID hardware
        RFIDManager::poll();

        // 2️⃣ Handle unified events
        Event evt;
        if (EventQueue::receive(evt)) {
            AccessController::handleEvent(evt);
        }

        // 3️⃣ Update access controller (timers / cooldown)
        AccessController::update();

        // (No keyboard simulation) - physical exit sensor now used

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
    RelayController::init();
    NVSStore::init();
    Serial.print("[HEAP] Free heap before Firebase: ");
    Serial.println(ESP.getFreeHeap());
    WiFiManager::init();
    // --- INIT SHARED SYSTEMS ---
    EventQueue::init();
    RelayController::init();
    BuzzerManager::init();
    NVSStore::init();
    LogStore::init();
    
    // Init exit sensor (physical) after event queue
    ExitSensor::init(EXIT_SENSOR_PIN);

    LogSync::init();

    Serial.print("ESP32 MAC: ");
    Serial.println(WiFi.macAddress());


    Serial.print("[NET] IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("[NET] DNS: ");
    Serial.println(WiFi.dnsIP());
    
    

  
    delay(500);

    

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
    static bool cloudInitDone = false;

    if (!cloudInitDone && WiFiManager::getState() == WiFiState::READY) {
        CommandProcessor::init();
        cloudInitDone = true;
    }
    LogSync::update();
    CommandProcessor::update();


    static uint32_t lastPrint = 0;

    // ===== DEBUG: READ TODAY'S LOG FILE =====


if (Serial.available()) {
    char c = Serial.read();
    if (c == 'S' || c == 's') {
        LogSync::triggerSync();
    }
    if (c == 'C' || c == 'c') {
        Serial.println("[CMD] Clearing ALL logs from LittleFS...");
        LogStore::clearAllLogs();
        Serial.println("[CMD] All logs cleared!");
    }
}

if (WiFiManager::getState() == WiFiState::READY) {
    // Safe to use Firebase
}



    vTaskDelay(100 / portTICK_PERIOD_MS);
}



