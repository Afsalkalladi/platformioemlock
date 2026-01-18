#include "nvs_store.h"
#include <nvs.h>
#include <functional>

// Namespaces
static const char* NS_WL = "wl";
static const char* NS_BL = "bl";
static const char* NS_PD = "pd";

static const uint8_t MAX_UIDS = 10;

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

void NVSStore::init() {
    wl.begin(NS_WL, false);
    bl.begin(NS_BL, false);
    pd.begin(NS_PD, false);

    Serial.println("[NVS] Store initialized");
}

// ================= QUERIES =================

bool NVSStore::isWhitelisted(const char* uid) {
    return wl.isKey(uid);
}

bool NVSStore::isBlacklisted(const char* uid) {
    return bl.isKey(uid);
}

bool NVSStore::isPending(const char* uid) {
    return pd.isKey(uid);
}

UIDState NVSStore::getState(const char* uid) {
    if (isWhitelisted(uid)) return UIDState::WHITELIST;
    if (isBlacklisted(uid)) return UIDState::BLACKLIST;
    if (isPending(uid))     return UIDState::PENDING;
    return UIDState::NONE;
}

// ================= MUTATIONS =================

bool NVSStore::addExclusive(Preferences& target, const char* uid, bool bypassLimit) {

    if (!bypassLimit && getCount(target) >= MAX_UIDS) {
        Serial.println("[NVS] Capacity reached");
        return false;
    }

    // Remove from other namespaces silently
    if (&target != &wl && wl.isKey(uid)) {
        wl.remove(uid);
        decCount(wl);
    }
    if (&target != &bl && bl.isKey(uid)) {
        bl.remove(uid);
        decCount(bl);
    }
    if (&target != &pd && pd.isKey(uid)) {
        pd.remove(uid);
        decCount(pd);
    }

    // Add to target if not present
    if (!target.isKey(uid)) {
        target.putUChar(uid, 1);
        incCount(target);
    }

    return true;
}

bool NVSStore::addToWhitelist(const char* uid) {
    return addExclusive(wl, uid, false);
}

bool NVSStore::addToBlacklist(const char* uid) {
    return addExclusive(bl, uid, false);
}

bool NVSStore::addToPending(const char* uid) {

    if (getState(uid) != UIDState::NONE) return false;

    if (getCount(pd) >= MAX_UIDS) {
        Serial.println("[NVS] Pending full");
        return false;
    }

    pd.putUChar(uid, 1);
    incCount(pd);
    return true;
}

void NVSStore::removeUID(const char* uid) {

    if (wl.isKey(uid)) {
        wl.remove(uid);
        decCount(wl);
    }
    if (bl.isKey(uid)) {
        bl.remove(uid);
        decCount(bl);
    }
    if (pd.isKey(uid)) {
        pd.remove(uid);
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
    nvs_iterator_t it = nvs_entry_find(NVS_DEFAULT_PART_NAME, NS_PD, NVS_TYPE_ANY);
    while (it != NULL) {
        nvs_entry_info_t info;
        nvs_entry_info(it, &info);
        if (strcmp(info.key, "__count") != 0) {
            cb(info.key);
        }
        it = nvs_entry_next(it);
    }
}

// ================= COUNTS =================

uint8_t NVSStore::whitelistCount() { return getCount(wl); }
uint8_t NVSStore::blacklistCount() { return getCount(bl); }
uint8_t NVSStore::pendingCount()   { return getCount(pd); }

