#pragma once
#include <Arduino.h>

enum class WiFiState : uint8_t {
    OFF,
    CONNECTING,
    CONNECTED,
    NTP_SYNCING,
    READY,
    ERROR
};

class WiFiManager {
public:
    static void init();
    static void update();           // called repeatedly on Core 0
    static bool isConnected();
    static bool isTimeValid();
    static WiFiState getState();
};
