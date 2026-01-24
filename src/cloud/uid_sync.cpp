#include "uid_sync.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "../storage/nvs_store.h"
#include "../storage/log_store.h"
#include "supabase_config.h"

static uint32_t lastSync = 0;
static bool manualTrigger = false;
static String deviceId;

static const uint32_t PERIODIC_INTERVAL = 60000; // 60s

void UIDSync::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    Serial.println("[UID_SYNC] Initialized for device: " + deviceId);
}

void UIDSync::trigger() {
    manualTrigger = true;
}

void UIDSync::update() {
    if (WiFi.status() != WL_CONNECTED) return;

    uint32_t now = millis();

    bool doSync = false;

    if (manualTrigger) {
        doSync = true;
        manualTrigger = false;
    }
    else if (now - lastSync >= PERIODIC_INTERVAL) {
        doSync = true;
    }

    if (!doSync) return;

    lastSync = now;

    // Fetch UIDs from Supabase
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/users?device_id=eq." + deviceId + "&select=uid,name,status";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    int httpCode = http.GET();
    
    if (httpCode != 200) {
        Serial.printf("[UID_SYNC] HTTP Error: %d\n", httpCode);
        http.end();
        return;
    }
    
    String payload = http.getString();
    http.end();
    
    // Parse JSON response
    DynamicJsonDocument doc(4096);
    DeserializationError err = deserializeJson(doc, payload);
    
    if (err) {
        Serial.printf("[UID_SYNC] JSON parse error: %s\n", err.c_str());
        return;
    }
    
    JsonArray users = doc.as<JsonArray>();
    
    if (users.size() == 0) {
        Serial.println("[UID_SYNC] No UIDs found for this device");
        return;
    }
    
    // Reset local UID storage before re-applying
    NVSStore::factoryReset();
    
    for (JsonObject user : users) {
        const char* uid = user["uid"];
        const char* status = user["status"];
        
        if (!uid || !status) continue;
        
        if (strcmp(status, "WHITELIST") == 0 || strcmp(status, "whitelist") == 0) {
            NVSStore::addToWhitelist(uid);
        }
        else if (strcmp(status, "BLACKLIST") == 0 || strcmp(status, "blacklist") == 0) {
            NVSStore::addToBlacklist(uid);
        }
        else if (strcmp(status, "PENDING") == 0 || strcmp(status, "pending") == 0) {
            NVSStore::addToPending(uid);
        }
    }
    
    Serial.printf("[UID_SYNC] Synced %d UIDs from Supabase\n", users.size());
}
