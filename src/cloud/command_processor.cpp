#include "command_processor.h"
#include "supabase_config.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include "../core/event_queue.h"
#include "../storage/log_store.h"
#include "../storage/nvs_store.h"

#include <ArduinoJson.h>

static String deviceId;
static String lastAckedCmd;


// ---------- JSON ESCAPE (REQUIRED) ----------
static String jsonEscape(const String& s) {
    String out;
    out.reserve(s.length() + 8);

    for (char c : s) {
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
        "{\"status\":\"DONE\",\"result\":\"" +
        jsonEscape(result) + "\"}";

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
        }
        return;
    }

    // -------- GET_PENDING: Admin explicitly requests all pending UIDs --------
    if (strcmp(type, "GET_PENDING") == 0) {
        Serial.println("[CMD] GET_PENDING received - building JSON array");

        String result = "[";
        bool first = true;

        NVSStore::forEachPending([&result, &first](const char* uid) {
            if (!first) result += ",";
            result += "\"" + String(uid) + "\"";
            first = false;
        });

        result += "]";

        Serial.printf("[CMD] Pending UIDs JSON: %s\n", result.c_str());
        
        if (ackCommand(cmdId, result)) {
            lastAckedCmd = cmdId;
        }
        return;
    }

    // -------- SYNC_UIDS: Reset local lists from cloud --------
    if (strcmp(type, "SYNC_UIDS") == 0) {
        Serial.println("[CMD] SYNC_UIDS received");

        JsonArray wl = cmd["payload"]["whitelist"];
        JsonArray bl = cmd["payload"]["blacklist"];

        if (!wl.isNull() && !bl.isNull()) {

            NVSStore::clearWhitelist();
            NVSStore::clearBlacklist();

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
        return;
    }

    // -------- SYNC_LOGS: Send access logs to cloud (BATCHED) --------
    if (strcmp(type, "SYNC_LOGS") == 0) {
        Serial.println("[CMD] SYNC_LOGS received - batching logs");

        // Build JSON array of all logs
        String body = "[";
        uint16_t count = 0;
        bool first = true;

        LogStore::forEach([&body, &count, &first, &deviceId](const LogEntry& entry) {
            const char* eventType = nullptr;
            
            switch (entry.event) {
                case LogEvent::ACCESS_GRANTED:
                    eventType = "GRANTED";
                    break;
                case LogEvent::ACCESS_DENIED:
                    eventType = "DENIED";
                    break;
                case LogEvent::UNKNOWN_CARD:
                    eventType = "PENDING";
                    break;
                case LogEvent::REMOTE_UNLOCK:
                    eventType = "REMOTE";
                    break;
                default:
                    return;
            }

            if (!first) body += ",";
            first = false;

            body += "{\"device_id\":\"" + deviceId +
                    "\",\"uid\":\"" + String(entry.uid) +
                    "\",\"event_type\":\"" + String(eventType) + "\"}";
            count++;
        });

        body += "]";

        String result;
        if (count == 0) {
            result = "LOGS_SYNCED:0";
            Serial.println("[CMD] No logs to sync");
        } else {
            Serial.printf("[CMD] Sending %d logs in one request...\n", count);

            HTTPClient post;
            String url = String(SUPABASE_URL) + "/rest/v1/access_logs";

            post.begin(url);
            post.addHeader("apikey", SUPABASE_KEY);
            post.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
            post.addHeader("Content-Type", "application/json");
            post.addHeader("Prefer", "return=minimal");

            int code = post.POST(body);
            post.end();

            if (code == 201 || code == 200) {
                result = "LOGS_SYNCED:" + String(count);
                Serial.printf("[CMD] Batch insert OK - %d logs\n", count);
            } else {
                result = "LOGS_SYNC_FAILED:" + String(code);
                Serial.printf("[CMD] Batch insert FAILED HTTP %d\n", code);
            }
        }
        
        if (ackCommand(cmdId, result)) {
            lastAckedCmd = cmdId;
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
            ackCommand(cmdId, "WHITELIST_ADD_OK");
        } else {
            Serial.println("[CMD] Whitelist FAILED for UID: " + String(uid));
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "wl_failed");
            ackCommand(cmdId, "WHITELIST_ADD_FAIL");
        }

        lastAckedCmd = cmdId;
        return;
    }

    if (strcmp(type, "BLACKLIST_ADD") == 0) {

        if (NVSStore::addToBlacklist(uid)) {
            Serial.println("[CMD] Blacklisted UID: " + String(uid));
            LogStore::log(LogEvent::UID_BLACKLISTED, uid, "supabase");
            ackCommand(cmdId, "BLACKLIST_ADD_OK");
        } else {
            Serial.println("[CMD] Blacklist FAILED for UID: " + String(uid));
            LogStore::log(LogEvent::COMMAND_ERROR, uid, "bl_failed");
            ackCommand(cmdId, "BLACKLIST_ADD_FAIL");
        }

        lastAckedCmd = cmdId;
        return;
    }

    if (strcmp(type, "REMOVE_UID") == 0) {

        NVSStore::removeUID(uid);
        Serial.println("[CMD] Removed UID: " + String(uid));
        LogStore::log(LogEvent::UID_REMOVED, uid, "supabase");
        ackCommand(cmdId, "REMOVE_UID_OK");

        lastAckedCmd = cmdId;
        return;
    }

    // ---- UNKNOWN COMMAND ----
    Serial.println("[CMD] Unknown command type: " + String(type));
    LogStore::log(LogEvent::COMMAND_ERROR, type, "unknown_cmd");
    ackCommand(cmdId, "UNKNOWN_COMMAND");
    lastAckedCmd = cmdId;
}
