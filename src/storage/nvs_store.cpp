#include "nvs_store.h"
#include <nvs.h>
#include <functional>
#include <ctype.h>

// Namespaces
static const char* NS_WL = "wl";
static const char* NS_BL = "bl";
static const char* NS_PD = "pd";

static const uint8_t MAX_UIDS = 50;

// ================= UID NORMALISATION =================
// NVS keys are case-sensitive.  RFID reader emits uppercase
// (%02X) but UIDs arriving from Supabase may be lowercase or
// contain separators (colons, dashes, spaces).  Normalise by:
//   1. Stripping all non-hex characters
//   2. Converting to uppercase
// Each caller provides its own buffer to avoid a shared static
// buffer that could be corrupted by nested / cross-core calls.
static void normalizeUID(const char* uid, char* out, size_t outSize) {
    size_t j = 0;
    for (size_t i = 0; uid[i] && j < outSize - 1; i++) {
        if (isxdigit((unsigned char)uid[i])) {
            out[j++] = toupper((unsigned char)uid[i]);
        }
        // Skip non-hex characters (colons, dashes, spaces, etc.)
    }
    out[j] = '\0';
}

Preferences NVSStore::wl;
Preferences NVSStore::bl;
Preferences NVSStore::pd;


// ================= COUNT HELPERS =================
static uint8_t getCount(Preferences& p) {
    return p.getUChar("__count", 0);
}

static void setCount(Preferences& p, uint8_t v) {
    p.putUChar("__count", v);
}

static void incCount(Preferences& p) {
    setCount(p, getCount(p) + 1);
}

static void decCount(Preferences& p) {
    uint8_t c = getCount(p);
    if (c > 0) setCount(p, c - 1);
}

// ================= INIT =================
static const char* NS_SYS = "sys";
Preferences NVSStore::sys;


void NVSStore::init() {
    wl.begin(NS_WL, false);
    bl.begin(NS_BL, false);
    pd.begin(NS_PD, false);
    sys.begin(NS_SYS, false);

    Serial.println("[NVS] Store initialized");
}



// ================= QUERIES =================

bool NVSStore::isWhitelisted(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));
    bool found = wl.isKey(norm);
    Serial.printf("[NVS] isWhitelisted(%s) norm=%s -> %s\n", uid, norm, found ? "YES" : "NO");
    return found;
}

bool NVSStore::isBlacklisted(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));
    return bl.isKey(norm);
}

bool NVSStore::isPending(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));
    return pd.isKey(norm);
}

UIDState NVSStore::getState(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));
    if (wl.isKey(norm)) return UIDState::WHITELIST;
    if (bl.isKey(norm)) return UIDState::BLACKLIST;
    if (pd.isKey(norm)) return UIDState::PENDING;
    return UIDState::NONE;
}

// ================= MUTATIONS =================

bool NVSStore::addExclusive(Preferences& target, const char* uid, bool bypassLimit) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));

    if (!bypassLimit && getCount(target) >= MAX_UIDS) {
        Serial.printf("[NVS] Capacity reached (%d/%d), cannot add %s\n",
                      getCount(target), MAX_UIDS, norm);
        return false;
    }

    // Remove from other namespaces silently
    if (&target != &wl && wl.isKey(norm)) {
        wl.remove(norm);
        decCount(wl);
    }
    if (&target != &bl && bl.isKey(norm)) {
        bl.remove(norm);
        decCount(bl);
    }
    if (&target != &pd && pd.isKey(norm)) {
        pd.remove(norm);
        decCount(pd);
    }

    // Add to target if not present
    if (!target.isKey(norm)) {
        size_t written = target.putUChar(norm, 1);
        if (written == 0) {
            Serial.printf("[NVS] ERROR: putUChar FAILED for key %s (NVS full?)\n", norm);
            return false;
        }
        incCount(target);
        Serial.printf("[NVS] Stored key=%s count=%d\n", norm, getCount(target));
    }

    return true;
}

bool NVSStore::addToWhitelist(const char* uid, bool bypassLimit) {
    return addExclusive(wl, uid, bypassLimit);
}

bool NVSStore::addToBlacklist(const char* uid, bool bypassLimit) {
    return addExclusive(bl, uid, bypassLimit);
}

bool NVSStore::addToPending(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));

    Serial.printf("[NVS] addToPending called for: %s (normalised: %s)\n", uid, norm);

    // Check each namespace with the SAME local buffer (no re-normalization needed)
    if (wl.isKey(norm)) {
        Serial.printf("[NVS] UID %s already in WHITELIST, not adding to pending\n", norm);
        return false;
    }
    if (bl.isKey(norm)) {
        Serial.printf("[NVS] UID %s already in BLACKLIST, not adding to pending\n", norm);
        return false;
    }
    if (pd.isKey(norm)) {
        Serial.printf("[NVS] UID %s already in PENDING\n", norm);
        return false;
    }

    if (getCount(pd) >= MAX_UIDS) {
        Serial.println("[NVS] Pending full");
        return false;
    }

    size_t written = pd.putUChar(norm, 1);
    if (written == 0) {
        Serial.printf("[NVS] ERROR: putUChar FAILED for pending key %s\n", norm);
        return false;
    }
    incCount(pd);
    Serial.printf("[NVS] Added %s to pending, new count=%d\n", norm, getCount(pd));
    return true;
}

void NVSStore::removeUID(const char* uid) {
    char norm[16];
    normalizeUID(uid, norm, sizeof(norm));

    if (wl.isKey(norm)) {
        wl.remove(norm);
        decCount(wl);
    }
    if (bl.isKey(norm)) {
        bl.remove(norm);
        decCount(bl);
    }
    if (pd.isKey(norm)) {
        pd.remove(norm);
        decCount(pd);
    }
}

// ================= SYNC HELPERS =================
void NVSStore::clearWhitelist() {
    wl.clear();
    setCount(wl, 0);
}

void NVSStore::clearBlacklist() {
    bl.clear();
    setCount(bl, 0);
}
// ================= RESET =================

void NVSStore::factoryReset() {
    wl.clear();
    bl.clear();
    pd.clear();
    setCount(wl, 0);
    setCount(bl, 0);
    setCount(pd, 0);
    Serial.println("[NVS] Factory reset completed");
}

void NVSStore::forEachPending(const std::function<void(const char* uid)>& cb) {
    Serial.printf("[NVS] forEachPending called, count=%d\n", getCount(pd));
    
    nvs_iterator_t it = nvs_entry_find(NVS_DEFAULT_PART_NAME, NS_PD, NVS_TYPE_ANY);
    
    if (it == NULL) {
        Serial.println("[NVS] Iterator is NULL - no entries found in namespace");
    }
    
    int found = 0;
    while (it != NULL) {
        nvs_entry_info_t info;
        nvs_entry_info(it, &info);
        Serial.printf("[NVS] Found key: %s\n", info.key);
        if (strcmp(info.key, "__count") != 0) {
            // Copy key to local buffer before calling callback
            char keyCopy[16];
            strncpy(keyCopy, info.key, sizeof(keyCopy) - 1);
            keyCopy[sizeof(keyCopy) - 1] = '\0';
            cb(keyCopy);
            found++;
        }
        it = nvs_entry_next(it);
    }
    
    Serial.printf("[NVS] forEachPending found %d UIDs\n", found);
}

void NVSStore::clearPending() {
    pd.clear();
    setCount(pd, 0);
}


// ================= COUNTS =================

uint8_t NVSStore::whitelistCount() { return getCount(wl); }
uint8_t NVSStore::blacklistCount() { return getCount(bl); }
uint8_t NVSStore::pendingCount()   { return getCount(pd); }


void NVSStore::setLastCommandId(const char* id) {
    sys.putString("last_cmd", id);
}

String NVSStore::getLastCommandId() {
    return sys.getString("last_cmd", "");
}
