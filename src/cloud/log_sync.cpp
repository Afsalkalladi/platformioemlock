#include "log_sync.h"
#include <LittleFS.h>
#include <FS.h>

static bool syncing = false;
static File dir;
static File currentFile;

void LogSync::init() {
    syncing = false;
}

void LogSync::triggerSync() {
    if (syncing) return;

    Serial.println("[SYNC] Manual log sync started");

    dir = LittleFS.open("/");
    if (!dir || !dir.isDirectory()) {
        Serial.println("[SYNC] Failed to open FS root");
        return;
    }

    syncing = true;
}

void LogSync::update() {
    if (!syncing) return;

    // If no file currently open, get next file
    if (!currentFile) {
        currentFile = dir.openNextFile();

        if (!currentFile) {
            Serial.println("[SYNC] Log sync completed");
            syncing = false;
            dir.close();
            return;
        }

        if (!String(currentFile.name()).startsWith("/log_")) {
            currentFile.close();
            return;
        }

        Serial.print("[SYNC] Uploading ");
        Serial.println(currentFile.name());
    }

    // Read file line-by-line
    while (currentFile.available()) {
        String line = currentFile.readStringUntil('\n');
        Serial.print("[CLOUD] ");
        Serial.println(line);
        return; // 🚨 ONE LINE PER UPDATE (NON-BLOCKING)
    }

    // File finished
    currentFile.close();
}
