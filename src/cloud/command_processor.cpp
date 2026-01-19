#include "command_processor.h"
#include "supabase_config.h"
#include "supabase_sync.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include "../core/event_queue.h"
#include "../storage/log_store.h"
#include "../storage/nvs_store.h"

#include <ArduinoJson.h>

static String deviceId;
static String lastAckedCmd; // runtime cache


// ---------- JSON ESCAPE (REQUIRED) ----------
static String jsonEscape(const String& s) {
    String out;
    out.reserve(s.length() + 16);

    for (size_t i = 0; i < s.length(); i++) {
        char c = s[i];
        switch (c) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
        }
    }
    return out;
}


static bool ackCommand(const String& cmdId, const String& result) {
    HTTPClient http;

    String url = String(SUPABASE_URL) +
        "/rest/v1/device_commands?id=eq." + cmdId;

    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");

    String body =
        "{\"status\":\"DONE\",\"result\":\"" + jsonEscape(result) + "\"}";



    int code = http.PATCH(body);
    http.end();

    if (code == 200 || code == 204) {
        Serial.printf("[CMD] ACK OK %s\n", cmdId.c_str());
        return true;
    }

    Serial.printf(
        "[CMD][ACK FAIL] %s HTTP %d BODY=%s\n",
        cmdId.c_str(), code, body.c_str()
    );
    return false;
}





void CommandProcessor::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    lastAckedCmd = NVSStore::getLastCommandId();
    Serial.println("[CMD] Last command restored: " + lastAckedCmd);

    Serial.println("[CMD] Supabase processor ready for " + deviceId);
}


void CommandProcessor::update() {
    if (WiFi.status() != WL_CONNECTED) return;

    static uint32_t lastPoll = 0;
    if (millis() - lastPoll < 3000) return;
    lastPoll = millis();

    HTTPClient http;

    String url = String(SUPABASE_URL) +
        "/rest/v1/device_commands"
        "?device_id=eq." + deviceId +
        "&status=eq.PENDING"
        "&order=created_at.asc"
        "&limit=1";

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

    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, payload)) return;

    JsonArray arr = doc.as<JsonArray>();
    if (arr.size() == 0) return;

    JsonObject cmd = arr[0];

    const char* cmdId = cmd["id"];
    const char* type  = cmd["type"];
    const char* uid   = cmd["uid"];   // may be null

    if (!cmdId || !type) return;

    // -------- DUPLICATE GUARD --------
    if (lastAckedCmd == cmdId) {
        Serial.println("[CMD] Duplicate ignored: " + String(cmdId));
        return;
    }

    Serial.printf(
        "[CMD] Received: id=%s type=%s uid=%s\n",
        cmdId,
        type,
        uid ? uid : "-"
    );

    // -------- EXECUTION --------

    if (strcmp(type, "REMOTE_UNLOCK") == 0) {

        Event e{};
        e.type = EventType::REMOTE_UNLOCK;
        EventQueue::send(e);

        LogStore::log(LogEvent::REMOTE_UNLOCK, "-", "supabase");

        if (ackCommand(cmdId, "REMOTE_UNLOCK_OK")) {
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
        }
        return;
    }

    // -------- GET_PENDING: Admin explicitly requests all pending UIDs --------
    if (strcmp(type, "GET_PENDING") == 0) {

        StaticJsonDocument<512> out;
        JsonArray arr = out.to<JsonArray>();

        NVSStore::forEachPending([&](const char* uid) {
            // Use String to force ArduinoJson to copy the data
            arr.add(String(uid));
        });

        String result;
        serializeJson(arr, result);

        LogStore::log(LogEvent::UID_SYNC, "-", "get_pending");

        if (ackCommand(cmdId, "PENDING:" + result)) {
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
        }
        return;
    }

    // -------- GET_DEBUG: Get NVS stats --------
    if (strcmp(type, "GET_DEBUG") == 0) {

        String debug = "WL:" + String(NVSStore::whitelistCount()) +
                       ",BL:" + String(NVSStore::blacklistCount()) +
                       ",PD:" + String(NVSStore::pendingCount());

        Serial.println("[CMD] GET_DEBUG: " + debug);

        if (ackCommand(cmdId, debug)) {
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
        }
        return;
    }

    // ---- UID REQUIRED BELOW ----
    if (!uid || strlen(uid) == 0) {
        LogStore::log(LogEvent::COMMAND_ERROR, "-", "missing_uid");
        ackCommand(cmdId, "MISSING_UID");
        lastAckedCmd = cmdId;
        return;
    }

    if (strcmp(type, "WHITELIST_ADD") == 0) {

        if (NVSStore::addToWhitelist(uid)) {
            Serial.println("[CMD] Whitelisted UID: " + String(uid));
            LogStore::log(LogEvent::UID_WHITELISTED, uid, "supabase");
            
            // Sync to Supabase
            SupabaseSync::syncUidToSupabase(uid, "WHITELIST");
            SupabaseSync::removePendingFromSupabase(uid);
            
            ackCommand(cmdId, "WHITELIST_ADD_OK");
        } else {
            Serial.println("[CMD] Whitelist FAILED for UID: " + String(uid));
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "wl_failed");
            ackCommand(cmdId, "WHITELIST_ADD_FAIL");
        }

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }

    if (strcmp(type, "BLACKLIST_ADD") == 0) {

        if (NVSStore::addToBlacklist(uid)) {
            Serial.println("[CMD] Blacklisted UID: " + String(uid));
            LogStore::log(LogEvent::UID_BLACKLISTED, uid, "supabase");
            
            // Sync to Supabase
            SupabaseSync::syncUidToSupabase(uid, "BLACKLIST");
            SupabaseSync::removePendingFromSupabase(uid);
            
            ackCommand(cmdId, "BLACKLIST_ADD_OK");
        } else {
            Serial.println("[CMD] Blacklist FAILED for UID: " + String(uid));
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "bl_failed");
            ackCommand(cmdId, "BLACKLIST_ADD_FAIL");
        }

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }

    if (strcmp(type, "REMOVE_UID") == 0) {

        NVSStore::removeUID(uid);
        Serial.println("[CMD] Removed UID: " + String(uid));
        LogStore::log(LogEvent::UID_REMOVED, uid, "supabase");
        
        // Sync to Supabase
        SupabaseSync::removeUidFromSupabase(uid);
        
        ackCommand(cmdId, "REMOVE_UID_OK");

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }
    if (strcmp(type, "SYNC_UIDS") == 0) {

        JsonObject payload = cmd["payload"];
if (payload.isNull()) {
    ackCommand(cmdId, "SYNC_UIDS_NO_PAYLOAD");
    lastAckedCmd = cmdId;
    NVSStore::setLastCommandId(cmdId);
    return;
}

JsonArray wl = payload["whitelist"];
JsonArray bl = payload["blacklist"];

if (wl.isNull() || bl.isNull()) {
    ackCommand(cmdId, "SYNC_UIDS_BAD_PAYLOAD");
    lastAckedCmd = cmdId;
    NVSStore::setLastCommandId(cmdId);
    return;
}


        if (!wl.isNull() && !bl.isNull()) {

            NVSStore::clearWhitelist();
            NVSStore::clearBlacklist();
            NVSStore::clearPending();   // <-- ADD THIS LINE HERE


            for (JsonVariant v : wl) {
                NVSStore::addToWhitelist(v.as<const char*>());
                Serial.printf("[SYNC] WL %s\n", v.as<const char*>());
            }

            for (JsonVariant v : bl) {
                NVSStore::addToBlacklist(v.as<const char*>());
                Serial.printf("[SYNC] BL %s\n", v.as<const char*>());
            }

            LogStore::log(LogEvent::UID_SYNC, "-", "cloud");
            ackCommand(cmdId, "SYNC_UIDS_OK");
        } else {
            ackCommand(cmdId, "SYNC_UIDS_BAD_PAYLOAD");
        }

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }

    // ---- UNKNOWN COMMAND ----
    Serial.println("[CMD] Unknown command type: " + String(type));
    LogStore::log(LogEvent::COMMAND_ERROR, type, "unknown_cmd");
    ackCommand(cmdId, "UNKNOWN_COMMAND");
    lastAckedCmd = cmdId;
    NVSStore::setLastCommandId(cmdId);
}
