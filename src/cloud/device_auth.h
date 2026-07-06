#pragma once
#include <Arduino.h>

class HTTPClient;

// Manages the device's own Supabase Auth session (JWT).
// Signs in with DEVICE_EMAIL/DEVICE_PASSWORD, refreshes automatically.
class DeviceAuth {
public:
    static void init();
    static void update();            // call every loop() - non-blocking except during (re)login
    static bool isReady();           // true when a valid access token is held
    static String token();           // current JWT
    static uint32_t tokenVersion();  // bumps on every new token (realtime re-auth)
    static void forceRefresh();      // call after an HTTP 401
    static void addHeaders(HTTPClient& http);  // apikey + Authorization headers
};
