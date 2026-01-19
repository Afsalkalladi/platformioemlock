#include "supabase_sync.h"
#include "supabase_config.h"
#include "../storage/nvs_store.h"
#include <HTTPClient.h>
#include <WiFi.h>

static String deviceId;
static bool initialSyncDone = false;

static String getISOTimestamp() {
    // Use current millis as a simple relative timestamp
    // Supabase will use NOW() on the server side
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
        char buf[30];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buf);
    }
    // Fallback - let Supabase use default
    return "";
}

void SupabaseSync::init() {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
    Serial.println("[SUPA_SYNC] Initialized for device: " + deviceId);
    initialSyncDone = false;
}

void SupabaseSync::update() {
    // Do initial sync once after WiFi is connected
    if (!initialSyncDone && WiFi.status() == WL_CONNECTED) {
        Serial.println("[SUPA_SYNC] Starting initial sync from NVS to Supabase...");
        syncAllToSupabase();
        initialSyncDone = true;
    }
}

// Full sync: upload all NVS data to Supabase
void SupabaseSync::syncAllToSupabase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[SUPA_SYNC] WiFi not connected, skipping full sync");
        return;
    }

    Serial.println("[SUPA_SYNC] ===== FULL SYNC START =====");

    // Sync all whitelisted UIDs
    int wlCount = 0;
    NVSStore::forEachWhitelist([&](const char* uid) {
        syncUidToSupabase(uid, "WHITELIST");
        wlCount++;
        delay(100); // Small delay to avoid overwhelming Supabase
    });
    Serial.printf("[SUPA_SYNC] Synced %d whitelisted UIDs\n", wlCount);

    // Sync all blacklisted UIDs
    int blCount = 0;
    NVSStore::forEachBlacklist([&](const char* uid) {
        syncUidToSupabase(uid, "BLACKLIST");
        blCount++;
        delay(100);
    });
    Serial.printf("[SUPA_SYNC] Synced %d blacklisted UIDs\n", blCount);

    // Sync all pending UIDs
    int pdCount = 0;
    NVSStore::forEachPending([&](const char* uid) {
        addPendingToSupabase(uid);
        pdCount++;
        delay(100);
    });
    Serial.printf("[SUPA_SYNC] Synced %d pending UIDs\n", pdCount);

    Serial.println("[SUPA_SYNC] ===== FULL SYNC COMPLETE =====");
}

// Upsert UID to device_uids table
void SupabaseSync::syncUidToSupabase(const char* uid, const char* state) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    // Use upsert with on_conflict
    String url = String(SUPABASE_URL) + "/rest/v1/device_uids";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "resolution=merge-duplicates");
    
    String ts = getISOTimestamp();
    String body;
    if (ts.length() > 0) {
        body = "{\"device_id\":\"" + deviceId + 
               "\",\"uid\":\"" + String(uid) + 
               "\",\"state\":\"" + String(state) + 
               "\",\"updated_at\":\"" + ts + "\"}";
    } else {
        body = "{\"device_id\":\"" + deviceId + 
               "\",\"uid\":\"" + String(uid) + 
               "\",\"state\":\"" + String(state) + "\"}";
    }
    
    int code = http.POST(body);
    http.end();
    
    if (code == 200 || code == 201) {
        Serial.printf("[SUPA_SYNC] UID %s -> %s synced OK\n", uid, state);
    } else {
        Serial.printf("[SUPA_SYNC] UID sync failed: %d\n", code);
    }
}

// Remove UID from device_uids table
void SupabaseSync::removeUidFromSupabase(const char* uid) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    String url = String(SUPABASE_URL) + 
                 "/rest/v1/device_uids?device_id=eq." + deviceId + 
                 "&uid=eq." + String(uid);
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    
    int code = http.sendRequest("DELETE");
    http.end();
    
    if (code == 200 || code == 204) {
        Serial.printf("[SUPA_SYNC] UID %s removed from Supabase\n", uid);
    } else {
        Serial.printf("[SUPA_SYNC] UID remove failed: %d\n", code);
    }
}

// Remove UID from device_pending_reports table
void SupabaseSync::removePendingFromSupabase(const char* uid) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    String url = String(SUPABASE_URL) + 
                 "/rest/v1/device_pending_reports?device_id=eq." + deviceId + 
                 "&uid=eq." + String(uid);
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    
    int code = http.sendRequest("DELETE");
    http.end();
    
    if (code == 200 || code == 204) {
        Serial.printf("[SUPA_SYNC] Pending UID %s removed\n", uid);
    } else {
        Serial.printf("[SUPA_SYNC] Pending remove failed: %d\n", code);
    }
}

// Add UID to device_pending_reports table (when unknown card scanned)
void SupabaseSync::addPendingToSupabase(const char* uid) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    String url = String(SUPABASE_URL) + "/rest/v1/device_pending_reports";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "resolution=merge-duplicates");
    
    String ts = getISOTimestamp();
    String body;
    if (ts.length() > 0) {
        body = "{\"device_id\":\"" + deviceId + 
               "\",\"uid\":\"" + String(uid) + 
               "\",\"reported_at\":\"" + ts + "\"}";
    } else {
        body = "{\"device_id\":\"" + deviceId + 
               "\",\"uid\":\"" + String(uid) + "\"}";
    }
    
    int code = http.POST(body);
    http.end();
    
    if (code == 200 || code == 201) {
        Serial.printf("[SUPA_SYNC] Pending UID %s reported\n", uid);
    } else {
        Serial.printf("[SUPA_SYNC] Pending report failed: %d\n", code);
    }
}

// Log event to Supabase device_logs table
void SupabaseSync::logToSupabase(const char* eventType, const char* uid, const char* info) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    String url = String(SUPABASE_URL) + "/rest/v1/device_logs";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    String body = "{\"device_id\":\"" + deviceId + 
                  "\",\"event_type\":\"" + String(eventType) + 
                  "\",\"uid\":\"" + String(uid) + 
                  "\",\"info\":\"" + String(info) + "\"}";
    
    int code = http.POST(body);
    http.end();
    
    if (code == 200 || code == 201) {
        Serial.printf("[SUPA_LOG] %s logged OK\n", eventType);
    } else {
        Serial.printf("[SUPA_LOG] Log failed: %d\n", code);
    }
}
