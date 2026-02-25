#include "command_processor.h"
#include "supabase_config.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include "../core/event_queue.h"
#include "../core/thread_safe.h"
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

    // Use DynamicJsonDocument to handle large SYNC_UIDS payloads
    // (50 UIDs * ~20 bytes each + command envelope ≈ 2KB+)
    DynamicJsonDocument doc(4096);
    DeserializationError jsonErr = deserializeJson(doc, payload);
    if (jsonErr) {
        Serial.printf("[CMD] JSON parse error: %s (payload len=%d)\n", 
                      jsonErr.c_str(), payload.length());
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    if (arr.size() == 0) return;

    JsonObject cmd = arr[0];

    const char* cmdId = cmd["id"];
    const char* type  = cmd["type"];
    const char* uid   = cmd["uid"];   // may be null

    if (!cmdId || !type) return;

    // Normalize and trim incoming type to avoid whitespace/case issues
    String typeStr = String(type);
    typeStr.trim();

    // Normalize UID to uppercase so NVS keys always match the RFID reader
    String uidNorm;
    if (uid && strlen(uid) > 0) {
        uidNorm = String(uid);
        uidNorm.toUpperCase();
        uid = uidNorm.c_str();
    }

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

    if (typeStr == "REMOTE_UNLOCK") {

        Event e{};
        e.type = EventType::REMOTE_UNLOCK;
        EventQueue::send(e);

        // Note: Log is recorded by access_controller when event is handled

        if (ackCommand(cmdId, "REMOTE_UNLOCK_OK")) {
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
        }
        return;
    }

    // -------- GET_PENDING: Admin explicitly requests all pending UIDs --------
    if (typeStr == "GET_PENDING") {
        StaticJsonDocument<512> out;
        JsonArray arr = out.to<JsonArray>();

        // Lock mutex only for NVS access, release before logging
        {
            ThreadSafe::Guard guard(200);
            if (!guard.isAcquired()) {
                ackCommand(cmdId, "MUTEX_TIMEOUT");
                return;
            }

            NVSStore::forEachPending([&](const char* uid) {
                // Use String to force ArduinoJson to copy the data
                arr.add(String(uid));
            });
        } // Mutex released here

        String result;
        serializeJson(arr, result);

        // Log after mutex is released
        LogStore::log(LogEvent::UID_SYNC, "-", "get_pending");

        if (ackCommand(cmdId, result)) {
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
        }
        return;
    }

    // -------- GET_DEBUG: Get NVS stats --------
    if (typeStr == "GET_DEBUG") {

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

    // -------- WHITELIST_ADD: Add UID to whitelist --------
    if (typeStr == "WHITELIST_ADD") {
        if (!uid || strlen(uid) == 0) {
            ackCommand(cmdId, "WHITELIST_ADD_NO_UID");
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
            return;
        }

        bool success = false;
        // Lock mutex only for NVS access, release before logging
        {
            ThreadSafe::Guard guard(200);
            if (!guard.isAcquired()) {
                ackCommand(cmdId, "MUTEX_TIMEOUT");
                return;
            }

            success = NVSStore::addToWhitelist(uid);
        } // Mutex released here

        if (success) {
            Serial.println("[CMD] Whitelisted UID: " + String(uid));
            LogStore::log(LogEvent::UID_WHITELISTED, uid, "supabase");
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

    // -------- BLACKLIST_ADD: Add UID to blacklist --------
    if (typeStr == "BLACKLIST_ADD") {
        if (!uid || strlen(uid) == 0) {
            ackCommand(cmdId, "BLACKLIST_ADD_NO_UID");
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
            return;
        }

        bool success = false;
        // Lock mutex only for NVS access, release before logging
        {
            ThreadSafe::Guard guard(200);
            if (!guard.isAcquired()) {
                ackCommand(cmdId, "MUTEX_TIMEOUT");
                return;
            }

            success = NVSStore::addToBlacklist(uid);
        } // Mutex released here

        if (success) {
            Serial.println("[CMD] Blacklisted UID: " + String(uid));
            LogStore::log(LogEvent::UID_BLACKLISTED, uid, "supabase");
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

    // -------- REMOVE_UID: Remove UID from all lists --------
    if (typeStr == "REMOVE_UID") {
        if (!uid || strlen(uid) == 0) {
            ackCommand(cmdId, "REMOVE_UID_NO_UID");
            lastAckedCmd = cmdId;
            NVSStore::setLastCommandId(cmdId);
            return;
        }

        // Lock mutex only for NVS access, release before logging
        {
            ThreadSafe::Guard guard(200);
            if (!guard.isAcquired()) {
                ackCommand(cmdId, "MUTEX_TIMEOUT");
                return;
            }

            NVSStore::removeUID(uid);
        } // Mutex released here

        Serial.println("[CMD] Removed UID: " + String(uid));
        LogStore::log(LogEvent::UID_REMOVED, uid, "supabase");
        ackCommand(cmdId, "REMOVE_UID_OK");

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }

    // -------- SYNC_LOGS: Send access logs to cloud (BATCHED) --------
    if (typeStr == "SYNC_LOGS") {
        Serial.println("[CMD] SYNC_LOGS received - batching logs");

        // Build JSON array of all logs
        String body = "[";
        uint16_t count = 0;
        bool first = true;

        LogStore::forEach([&body, &count, &first](const LogEntry& entry) {
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
                    return;  // Skip unknown event types
            }

            // Convert timestamp to ISO 8601 format (replace space with T)
            String isoTimestamp = String(entry.timestampStr);
            isoTimestamp.replace(" ", "T");
            
            // Skip entries with invalid 1970 timestamps (before NTP sync)
            if (isoTimestamp.startsWith("1970") || isoTimestamp.length() < 10) {
                return;  // Skip this entry - don't add anything
            }

            // Add comma AFTER we know the entry is valid
            if (!first) body += ",";
            first = false;

            // Include actual scan timestamp (logged_at)
            body += "{\"device_id\":\"" + deviceId +
                    "\",\"uid\":\"" + String(entry.uid) +
                    "\",\"event_type\":\"" + String(eventType) +
                    "\",\"logged_at\":\"" + isoTimestamp + "\"}";
            count++;
        });

        body += "]";

        String result;
        if (count == 0) {
            result = "LOGS_SYNCED:0";
            Serial.println("[CMD] No logs to sync");
        } else {
            Serial.printf("[CMD] Sending %d logs in one request...\n", count);
            Serial.println("[CMD] Payload preview:");
            Serial.println(body.substring(0, min((unsigned int)500, body.length())));

            HTTPClient post;
            String url = String(SUPABASE_URL) + "/rest/v1/access_logs";

            post.begin(url);
            post.addHeader("apikey", SUPABASE_KEY);
            post.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
            post.addHeader("Content-Type", "application/json");
            post.addHeader("Prefer", "return=minimal");

            int code = post.POST(body);
            String responseBody = post.getString();  // Capture response
            post.end();

            if (code == 201 || code == 200) {
                result = "LOGS_SYNCED:" + String(count);
                Serial.printf("[CMD] Batch insert OK - %d logs\n", count);
                
                // Clear local logs after successful sync
                LogStore::clearAllLogs();
                Serial.println("[CMD] Local logs cleared after sync");
            } else {
                result = "LOGS_SYNC_FAILED:" + String(code);
                Serial.printf("[CMD] Batch insert FAILED HTTP %d\n", code);
                Serial.println("[CMD] Error response:");
                Serial.println(responseBody);
            }
        }
        
        if (ackCommand(cmdId, result)) {
            lastAckedCmd = cmdId;
        }
        return;
    }

    // -------- SYNC_UIDS: Full sync from server --------
    if (typeStr == "SYNC_UIDS") {
        Serial.println("[CMD] SYNC_UIDS received");

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

        // Lock mutex for all NVS operations, release before logging
        {
            ThreadSafe::Guard guard(1000);  // Generous timeout for bulk operations
            if (!guard.isAcquired()) {
                ackCommand(cmdId, "MUTEX_TIMEOUT");
                lastAckedCmd = cmdId;
                NVSStore::setLastCommandId(cmdId);
                return;
            }

            // Clear all local state first
            NVSStore::clearWhitelist();
            NVSStore::clearBlacklist();
            NVSStore::clearPending();

            Serial.printf("[SYNC] Payload: %d WL, %d BL UIDs to apply\n", wl.size(), bl.size());

            // Apply whitelist from server
            uint8_t wlOk = 0, wlFail = 0;
            for (JsonVariant v : wl) {
                const char* raw = v.as<const char*>();
                if (!raw || strlen(raw) == 0) { wlFail++; continue; }
                String uidUpper = String(raw);
                uidUpper.toUpperCase();
                bool ok = NVSStore::addToWhitelist(uidUpper.c_str(), true);  // bypassLimit for sync
                if (ok) wlOk++; else wlFail++;
                Serial.printf("[SYNC] WL %s -> %s\n", uidUpper.c_str(), ok ? "OK" : "FAIL");
            }

            // Apply blacklist from server
            uint8_t blOk = 0, blFail = 0;
            for (JsonVariant v : bl) {
                const char* raw = v.as<const char*>();
                if (!raw || strlen(raw) == 0) { blFail++; continue; }
                String uidUpper = String(raw);
                uidUpper.toUpperCase();
                bool ok = NVSStore::addToBlacklist(uidUpper.c_str(), true);  // bypassLimit for sync
                if (ok) blOk++; else blFail++;
                Serial.printf("[SYNC] BL %s -> %s\n", uidUpper.c_str(), ok ? "OK" : "FAIL");
            }

            Serial.printf("[SYNC] Applied WL: %d ok / %d fail, BL: %d ok / %d fail\n",
                          wlOk, wlFail, blOk, blFail);

            // Verify stored counts match expected
            uint8_t storedWL = NVSStore::whitelistCount();
            uint8_t storedBL = NVSStore::blacklistCount();
            if (storedWL != wlOk || storedBL != blOk) {
                Serial.printf("[SYNC] WARNING: Count mismatch! Stored WL=%d (expected %d), BL=%d (expected %d)\n",
                              storedWL, wlOk, storedBL, blOk);
            }
        } // Mutex released here

        // Log after mutex is released
        String syncResult = "SYNC_UIDS_OK WL:" + String(NVSStore::whitelistCount()) +
                            " BL:" + String(NVSStore::blacklistCount());
        Serial.println("[SYNC] Final counts - " + syncResult);
        LogStore::log(LogEvent::UID_SYNC, "-", "cloud");
        ackCommand(cmdId, syncResult);

        lastAckedCmd = cmdId;
        NVSStore::setLastCommandId(cmdId);
        return;
    }

    // ---- UNKNOWN COMMAND ----
    Serial.println("[CMD] Unknown command type: " + typeStr);
    LogStore::log(LogEvent::COMMAND_ERROR, typeStr.c_str(), "unknown_cmd");
    ackCommand(cmdId, "UNKNOWN_COMMAND");
    lastAckedCmd = cmdId;
    NVSStore::setLastCommandId(cmdId);
}
