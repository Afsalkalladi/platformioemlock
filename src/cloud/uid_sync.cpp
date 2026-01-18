#include "uid_sync.h"
#include <Firebase_ESP_Client.h>
#include <WiFi.h>
#include "../storage/nvs_store.h"
#include "../storage/log_store.h"
#include "firebase_context.h"

static uint32_t lastSync = 0;
static bool manualTrigger = false;
static String deviceId;

static const uint32_t PERIODIC_INTERVAL = 60000; // 60s

void UIDSync::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
}

void UIDSync::trigger() {
    manualTrigger = true;
}

void UIDSync::update() {

    if (WiFi.status() != WL_CONNECTED) return;
    if (!Firebase.ready()) return;

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

    String path = "/devices/" + deviceId + "/uids";

    if (!Firebase.RTDB.getJSON(&fbdo, path)) {
        return;
    }

    FirebaseJson *json = fbdo.jsonObjectPtr();
    if (!json) return;

    // Reset local UID storage before re-applying
    NVSStore::factoryReset();

    size_t count = json->iteratorBegin();

    for (size_t i = 0; i < count; i++) {

        int type;
        String uid;
        String state;

        json->iteratorGet(i, type, uid, state);

        if (state == "WHITELIST") {
            NVSStore::addToWhitelist(uid.c_str());
        }
        else if (state == "BLACKLIST") {
            NVSStore::addToBlacklist(uid.c_str());
        }
        else if (state == "PENDING") {
            NVSStore::addToPending(uid.c_str());
        }
    }

    json->iteratorEnd();

    LogStore::log(LogEvent::COMMAND_ERROR, "-", "uid_sync");
}
