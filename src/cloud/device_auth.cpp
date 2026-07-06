#include "device_auth.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "supabase_config.h"

static String   accessToken;
static String   refreshTokenStr;
static uint32_t expiresAtMs   = 0;   // refresh due at this millis()
static uint32_t lastAttemptMs = 0;
static uint32_t tokenVer      = 0;

static bool requestToken(bool useRefresh) {
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/auth/v1/token?grant_type=" +
                 (useRefresh ? "refresh_token" : "password");

    http.begin(url);
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Content-Type", "application/json");

    String body;
    if (useRefresh) {
        body = String("{\"refresh_token\":\"") + refreshTokenStr + "\"}";
    } else {
        body = String("{\"email\":\"") + DEVICE_EMAIL +
               "\",\"password\":\"" + DEVICE_PASSWORD + "\"}";
    }

    int code = http.POST(body);
    if (code != 200) {
        Serial.printf("[AUTH] %s failed HTTP %d\n",
                      useRefresh ? "refresh" : "login", code);
        http.end();
        return false;
    }

    String payload = http.getString();
    http.end();

    // Only parse the three fields we need (keeps RAM usage low)
    StaticJsonDocument<192> filter;
    filter["access_token"]  = true;
    filter["refresh_token"] = true;
    filter["expires_in"]    = true;

    DynamicJsonDocument doc(4096);
    if (deserializeJson(doc, payload, DeserializationOption::Filter(filter))) {
        Serial.println("[AUTH] JSON parse error");
        return false;
    }

    const char* at = doc["access_token"];
    const char* rt = doc["refresh_token"];
    long expiresIn = doc["expires_in"] | 3600;

    if (!at || strlen(at) == 0) return false;

    accessToken = at;
    if (rt && strlen(rt) > 0) refreshTokenStr = rt;

    // Schedule the refresh 5 minutes before real expiry
    long margin = (expiresIn > 600) ? 300 : expiresIn / 2;
    expiresAtMs = millis() + (uint32_t)(expiresIn - margin) * 1000UL;
    tokenVer++;

    Serial.println("[AUTH] Device session OK");
    return true;
}

void DeviceAuth::init() {
    accessToken     = "";
    refreshTokenStr = "";
    expiresAtMs     = 0;
    lastAttemptMs   = 0;
    Serial.println("[AUTH] Device auth ready (login on first update)");
}

void DeviceAuth::update() {
    if (WiFi.status() != WL_CONNECTED) return;

    bool needToken = (accessToken.length() == 0) ||
                     ((int32_t)(millis() - expiresAtMs) >= 0);
    if (!needToken) return;

    // Rate-limit attempts to one per 10 s
    if (lastAttemptMs != 0 && millis() - lastAttemptMs < 10000) return;
    lastAttemptMs = millis();

    bool ok = (refreshTokenStr.length() > 0) ? requestToken(true)
                                             : requestToken(false);
    if (!ok && refreshTokenStr.length() > 0) {
        // Refresh token rejected -> fall back to full password login next try
        refreshTokenStr = "";
    }
}

bool DeviceAuth::isReady() {
    return accessToken.length() > 0 &&
           (int32_t)(millis() - expiresAtMs) < 0;
}

String DeviceAuth::token() {
    return accessToken;
}

uint32_t DeviceAuth::tokenVersion() {
    return tokenVer;
}

void DeviceAuth::forceRefresh() {
    expiresAtMs   = millis();   // expire now -> next update() re-authenticates
    lastAttemptMs = 0;
}

void DeviceAuth::addHeaders(HTTPClient& http) {
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + accessToken);
}
