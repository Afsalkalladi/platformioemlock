#include "wifi_manager.h"
#include <WiFi.h>
#include <time.h>
#include "../storage/log_store.h"

static WiFiState state = WiFiState::OFF;

static uint32_t lastAttempt = 0;
static uint32_t retryDelay = 5000;   // start with 5s
static const uint32_t MAX_DELAY = 60000;

static bool timeValid = false;

static const char* SSID = "Airtel_SKETCH";
static const char* PASS = "Sketch@123";

static bool ntpTimeValid() {
    time_t now = time(nullptr);
    return now > 1700000000; // ~2023+ sanity check
}

void WiFiManager::init() {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true);
    state = WiFiState::CONNECTING;
    lastAttempt = millis();
}

void WiFiManager::update() {
    uint32_t now = millis();

    switch (state) {

    case WiFiState::CONNECTING:
        if (WiFi.status() != WL_CONNECTED &&
            now - lastAttempt >= retryDelay) {

            Serial.println("[WIFI] Connecting...");
            WiFi.begin(SSID, PASS);
            lastAttempt = now;
        }

        if (WiFi.status() == WL_CONNECTED) {
            Serial.println("[WIFI] Connected");
            state = WiFiState::CONNECTED;
            retryDelay = 5000; // reset backoff
        }
        break;

    case WiFiState::CONNECTED:
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
        state = WiFiState::NTP_SYNCING;
        break;

    case WiFiState::NTP_SYNCING:
        if (ntpTimeValid()) {
            Serial.println("[NTP] Time synchronized");
            timeValid = true;
            state = WiFiState::READY;
        }
        break;

    case WiFiState::READY:
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WIFI] Lost connection");
            LogStore::log(LogEvent::WIFI_LOST, "-", "disconnect");
            state = WiFiState::ERROR;
        }
        break;

    case WiFiState::ERROR:
        if (now - lastAttempt >= retryDelay) {
            retryDelay = min(retryDelay * 2, MAX_DELAY);
            state = WiFiState::CONNECTING;
            lastAttempt = now;
        }
        break;

    default:
        break;
    }
}

bool WiFiManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

bool WiFiManager::isTimeValid() {
    return timeValid;
}

WiFiState WiFiManager::getState() {
    return state;
}
