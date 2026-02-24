#pragma once
#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// ==================== CONFIG ====================
#define FW_VERSION_STR  "1.0.0"

// ==================== SUB-STRUCTURES ====================

struct TaskInfo {
    char name[32];
    uint8_t core;
    uint32_t stackHighWater;   // bytes
    uint32_t stackSize;        // bytes (0 if unavailable)
    uint8_t priority;
    bool isRunning;
};

// ==================== DEVICE HEALTH STRUCT ====================
// Every field here maps 1-to-1 to a JSON key sent to Supabase.

struct DeviceHealth {
    // ---------- RFID / PN532 ----------
    bool     rfidHealthy;            // communication OK && SAM OK
    bool     rfidCommunicationOk;    // SPI comms alive
    bool     rfidSamConfigured;      // SAMConfig() succeeded
    uint8_t  rfidIC;                 // IC byte (0x32 = PN532)
    uint8_t  rfidFirmwareMaj;        // firmware major
    uint8_t  rfidFirmwareMin;        // firmware minor
    uint8_t  rfidFirmwareSupport;    // feature bitmask
    uint32_t rfidPollCount;          // total poll() calls
    uint32_t rfidReinitCount;        // full hardware reinits
    String   lastRfidError;          // last error description
    String   lastRfidErrorTime;      // ISO timestamp
    String   lastSuccessfulReadTime; // ISO timestamp

    // ---------- System ----------
    uint32_t uptimeSeconds;
    uint32_t freeHeapBytes;
    uint32_t totalHeapBytes;
    uint32_t minFreeHeapBytes;
    uint32_t largestFreeBlockBytes;

    // ---------- WiFi ----------
    bool     wifiConnected;
    int8_t   wifiRssi;
    bool     ntpSynced;
    uint32_t wifiDisconnectCount;

    // ---------- Processor ----------
    uint32_t cpuFreqMhz;
    uint8_t  chipModel;        // 0=ESP32, 2=S2, 5=S3, 9=C3
    uint8_t  chipRevision;
    uint8_t  chipCores;

    // ---------- Dual-core status ----------
    bool     core0IsIdle;
    char     core0CurrentTask[32];
    uint32_t core0FreeStackBytes;

    bool     core1IsIdle;
    char     core1CurrentTask[32];
    uint32_t core1FreeStackBytes;

    // ---------- Storage ----------
    uint32_t littlefsTotalBytes;
    uint32_t littlefsUsedBytes;
    uint32_t littlefsFreeBytes;
    uint32_t nvsUsedEntries;

    // ---------- Watchdog ----------
    bool     watchdogEnabled;
    uint32_t watchdogTimeoutMs;

    // ---------- FreeRTOS tasks ----------
    TaskInfo tasks[16];
    uint8_t  taskCount;

    // ---------- Voltage monitoring ----------
    float voltage3v3;   // PN532 supply voltage (volts, from ADC)
};

// ==================== HEALTH MONITOR API ====================
// Only init() and update() are called from main.cpp.
// Everything else is auto-collected from RFIDManager::getHealth()
// and ESP system APIs each cycle.

class HealthMonitor {
public:
    static void init();
    static void update();              // call from loop(), handles periodic cloud push

    // Manual event reporters (WiFi layer calls these)
    static void reportWifiDisconnect();

    // Snapshot for debug / serial print
    static DeviceHealth getHealth();

    // Force an immediate push to Supabase
    static void syncToCloud();

private:
    static void collectAll();          // gather every metric
    static void pushHealthToSupabase();
};
