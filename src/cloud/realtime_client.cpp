#include "realtime_client.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "supabase_config.h"
#include "device_auth.h"
#include "command_processor.h"

static WebSocketsClient ws;
static bool     started       = false;
static bool     joined        = false;
static uint32_t lastHeartbeat = 0;
static uint32_t sentTokenVer  = 0;
static uint32_t refCounter    = 2;
static String   deviceId;

static void sendJoin() {
    // Subscribe to INSERTs on device_commands for this device only.
    String msg =
        String("{\"topic\":\"realtime:door\",\"event\":\"phx_join\",\"payload\":{"
               "\"config\":{\"postgres_changes\":[{\"event\":\"INSERT\","
               "\"schema\":\"public\",\"table\":\"device_commands\","
               "\"filter\":\"device_id=eq.") + deviceId + "\"}]},"
               "\"access_token\":\"" + DeviceAuth::token() + "\"},"
               "\"ref\":\"1\",\"join_ref\":\"1\"}";
    ws.sendTXT(msg);
    sentTokenVer = DeviceAuth::tokenVersion();
    Serial.println("[RT] Join sent");
}

static void onWsEvent(WStype_t type, uint8_t* payload, size_t len) {
    switch (type) {
        case WStype_CONNECTED:
            Serial.println("[RT] Websocket connected");
            joined = false;
            if (DeviceAuth::isReady()) {
                sendJoin();
                joined = true;
            }
            break;

        case WStype_DISCONNECTED:
            if (joined) Serial.println("[RT] Websocket disconnected");
            joined = false;
            break;

        case WStype_TEXT:
            // Any postgres_changes event on our channel = new command row.
            // We don't parse the payload - just poll immediately (the poll
            // also handles ordering, dedup and ack).
            if (payload && strstr((const char*)payload,
                                  "\"event\":\"postgres_changes\"") != nullptr) {
                Serial.println("[RT] Command push received -> polling now");
                CommandProcessor::pollNow();
            }
            break;

        default:
            break;
    }
}

void RealtimeClient::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    Serial.println("[RT] Realtime client ready for " + deviceId);
}

void RealtimeClient::update() {
    if (WiFi.status() != WL_CONNECTED) return;

    if (!started) {
        if (!DeviceAuth::isReady()) return;  // wait for the first token
        String path = String("/realtime/v1/websocket?apikey=") +
                      SUPABASE_ANON_KEY + "&vsn=1.0.0";
        ws.beginSSL(SUPABASE_HOST, 443, path.c_str());
        ws.onEvent(onWsEvent);
        ws.setReconnectInterval(5000);
        started = true;
        return;
    }

    ws.loop();

    // Join (or re-join after reconnect) once we have a token
    if (!joined && ws.isConnected() && DeviceAuth::isReady()) {
        sendJoin();
        joined = true;
    }

    if (!joined) return;

    // Phoenix heartbeat every 25 s keeps the channel alive
    if (millis() - lastHeartbeat > 25000) {
        lastHeartbeat = millis();
        String hb = String("{\"topic\":\"phoenix\",\"event\":\"heartbeat\","
                           "\"payload\":{},\"ref\":\"") + String(refCounter++) + "\"}";
        ws.sendTXT(hb);
    }

    // Push the fresh JWT to the channel whenever it rotates
    if (DeviceAuth::isReady() && DeviceAuth::tokenVersion() != sentTokenVer) {
        String msg = String("{\"topic\":\"realtime:door\",\"event\":\"access_token\","
                            "\"payload\":{\"access_token\":\"") + DeviceAuth::token() +
                     "\"},\"ref\":\"" + String(refCounter++) + "\"}";
        ws.sendTXT(msg);
        sentTokenVer = DeviceAuth::tokenVersion();
        Serial.println("[RT] Access token refreshed on channel");
    }
}

bool RealtimeClient::isConnected() {
    return started && ws.isConnected() && joined;
}
