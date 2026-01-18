#include "command_processor.h"
#include "supabase_config.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include "../core/event_queue.h"
#include "../storage/log_store.h"
#include "../storage/nvs_store.h"

#include <ArduinoJson.h>

static String deviceId;

void CommandProcessor::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    Serial.println("[CMD] Supabase processor ready for " + deviceId);
}



void CommandProcessor::update() {
    if (WiFi.status() != WL_CONNECTED) return;

    static uint32_t lastPoll = 0;
    if (millis() - lastPoll < 3000) return;
    lastPoll = millis();

    HTTPClient http;

    String url = String(SUPABASE_URL) +
        "/rest/v1/device_commands?device_id=eq." + deviceId +
        "&status=eq.PENDING&limit=1";

    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Accept", "application/json");

    int code = http.GET();
    if (code != 200) {
        http.end();
        return;
    }

    String payload = http.getString();
    http.end();

    if (payload.length() < 5) return;

    // ---------- JSON PARSE ----------
    StaticJsonDocument<1024> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        LogStore::log(LogEvent::COMMAND_ERROR, "-", "json_parse_fail");
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    if (arr.size() == 0) return;

    JsonObject cmd = arr[0];

    const char* cmdId = cmd["id"];
    const char* type  = cmd["type"];
    const char* uid   = cmd["uid"];

    if (!cmdId || !type) return;

    // ---------- EXECUTION ----------
    if (strcmp(type, "REMOTE_UNLOCK") == 0) {

        Event e{};
        e.type = EventType::REMOTE_UNLOCK;
        EventQueue::send(e);

        LogStore::log(LogEvent::REMOTE_UNLOCK, "-", "supabase");
    }

    else if (strcmp(type, "WHITELIST_ADD") == 0 && uid) {

        if (NVSStore::addToWhitelist(uid)) {
            LogStore::log(LogEvent::UID_WHITELISTED, uid, "supabase");
        } else {
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "wl_failed");
        }
    }

    else if (strcmp(type, "BLACKLIST_ADD") == 0 && uid) {

        if (NVSStore::addToBlacklist(uid)) {
            LogStore::log(LogEvent::UID_BLACKLISTED, uid, "supabase");
        } else {
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "bl_failed");
        }
    }

    else if (strcmp(type, "REMOVE_UID") == 0 && uid) {

        NVSStore::removeUID(uid);
        LogStore::log(LogEvent::UID_REMOVED, uid, "supabase");
    }

    else {
        LogStore::log(LogEvent::COMMAND_ERROR, type, "unknown_cmd");
    }

    // ---------- ACK ----------
    HTTPClient ack;
    String ackUrl = String(SUPABASE_URL) +
        "/rest/v1/device_commands?id=eq." + String(cmdId);

    ack.begin(ackUrl);
    ack.addHeader("apikey", SUPABASE_KEY);
    ack.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    ack.addHeader("Content-Type", "application/json");
    ack.PATCH("{\"status\":\"DONE\"}");
    ack.end();

    Serial.println("[CMD] Command ACKED: " + String(cmdId));
}
