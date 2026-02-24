#pragma once
#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// Task information structure
struct TaskInfo {
    char name[32];              // Task name
    uint8_t core;              // Core ID (0 or 1)
    uint32_t stackHighWater;   // Stack high water mark
    uint32_t stackSize;        // Total stack size
    uint8_t priority;          // Task priority
    bool isRunning;            // Is task currently running
};

// Health status that can be reported to the cloud
struct DeviceHealth {
    // RFID Reader Health (PN532)
    uint32_t rfidReinitCount;           // How many times the reader was fully reinitialized
    uint32_t rfidSoftResetCount;        // How many times soft reset was performed
    uint32_t lastSuccessfulReadMs;       // Millis of last successful card read
    uint32_t lastHealthCheckMs;          // Millis of last health check
    bool rfidHealthy;                    // Current health status of RFID reader
    bool rfidCommunicationOk;            // Can communicate with reader over SPI
    bool rfidSamConfigured;              // SAM configuration succeeded
    uint8_t rfidIC;                      // PN532 IC code (expect 0x32)
    uint8_t rfidFirmwareMaj;             // PN532 firmware major version
    uint8_t rfidFirmwareMin;             // PN532 firmware minor version
    uint8_t rfidFirmwareSupport;         // PN532 supported features bitmask
    uint32_t rfidPollCount;              // Total number of polls
    
    // System Health
    uint32_t uptimeSeconds;              // Total uptime in seconds
    uint32_t freeHeapBytes;              // Free heap memory
    uint32_t totalHeapBytes;             // Total heap size
    uint32_t minFreeHeapBytes;           // Minimum free heap ever
    uint32_t largestFreeBlockBytes;      // Largest free block
    uint32_t wifiDisconnectCount;        // WiFi disconnect count
    int8_t wifiRssi;                     // WiFi signal strength
    bool wifiConnected;                  // WiFi connection status
    bool ntpSynced;                      // NTP time sync status
    
    // Processor Information
    uint32_t cpuFreqMhz;                 // CPU frequency in MHz
    uint8_t chipModel;                   // Chip model (ESP32 = 0, ESP32-S2 = 2, etc.)
    uint8_t chipRevision;                // Chip revision
    uint8_t chipCores;                   // Number of CPU cores
    
    // Core 0 Status
    bool core0IsIdle;                    // Is core 0 idle
    char core0CurrentTask[32];          // Current task name on core 0
    uint32_t core0FreeStackBytes;        // Free stack on core 0
    
    // Core 1 Status
    bool core1IsIdle;                    // Is core 1 idle
    char core1CurrentTask[32];           // Current task name on core 1
    uint32_t core1FreeStackBytes;        // Free stack on core 1
    
    // Storage Information
    uint32_t littlefsTotalBytes;         // LittleFS total size
    uint32_t littlefsUsedBytes;          // LittleFS used size
    uint32_t littlefsFreeBytes;          // LittleFS free size
    uint32_t nvsUsedEntries;             // NVS used entries count
    
    // Watchdog Information
    bool watchdogEnabled;                // Is watchdog enabled
    uint32_t watchdogTimeoutMs;         // Watchdog timeout in ms
    
    // Task List
    TaskInfo tasks[16];                  // Array of task info (max 16 tasks)
    uint8_t taskCount;                   // Number of tasks
    
    // Timestamps (for cloud logging)
    String lastRfidError;                // Description of last RFID error
    String lastRfidErrorTime;            // When the last error occurred
    String lastSuccessfulReadTime;       // Human readable time of last successful scan
};

class HealthMonitor {
public:
    static void init();
    static void update();                // Call from main loop
    
    // RFID health reporting
    static void reportRfidOk();
    static void reportRfidError(const char* error);
    static void reportRfidReinit();
    static void reportRfidSoftReset();
    static void setRfidIC(uint8_t ic);
    static void setRfidHealthy(bool healthy);
    
    // System health
    static void reportWifiDisconnect();
    static void setWifiConnected(bool connected, int8_t rssi);
    static void setNtpSynced(bool synced);
    
    // Get current health snapshot
    static DeviceHealth getHealth();
    
    // Force sync health to cloud
    static void syncToCloud();
    
private:
    static void pushHealthToSupabase();
};
