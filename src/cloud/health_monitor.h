#pragma once
#include <Arduino.h>

// Health status that can be reported to the cloud
struct DeviceHealth {
    // RFID Reader Health
    uint32_t rfidReinitCount;           // How many times the reader was fully reinitialized
    uint32_t rfidSoftResetCount;        // How many times soft reset was performed
    uint32_t lastSuccessfulReadMs;       // Millis of last successful card read
    uint32_t lastHealthCheckMs;          // Millis of last health check
    bool rfidHealthy;                    // Current health status of RFID reader
    byte rfidVersion;                    // MFRC522 version register value
    
    // System Health
    uint32_t uptimeSeconds;              // Total uptime in seconds
    uint32_t freeHeapBytes;              // Free heap memory
    uint32_t wifiDisconnectCount;        // WiFi disconnect count
    int8_t wifiRssi;                     // WiFi signal strength
    bool wifiConnected;                  // WiFi connection status
    bool ntpSynced;                      // NTP time sync status
    
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
    static void setRfidVersion(byte version);
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
