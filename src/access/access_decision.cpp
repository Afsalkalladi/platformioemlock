#include "access_decision.h"
#include "../storage/nvs_store.h"
#include "../core/thread_safe.h"
#include <ctype.h>

// ================= UID VALIDATION =================
static bool isValidUID(const String &uid) {
    if (uid.length() < 4 || uid.length() > 16) return false;

    for (char c : uid) {
        if (!isxdigit(c)) return false;
    }
    return true;
}

// ================= DECISION LOGIC =================
AccessResult AccessDecision::evaluate(const String& uid) {

    // 1️⃣ INVALID UID → HARD DENY
    if (!isValidUID(uid)) {
        Serial.printf("[ACCESS] UID '%s' failed validation (len=%d)\n", uid.c_str(), uid.length());
        return AccessResult::INVALID;
    }

    const char* c_uid = uid.c_str();

    // CRITICAL: Lock mutex to prevent race condition with Core 0 accessing NVS
    // Use 300ms timeout to survive brief SYNC_UIDS operations
    ThreadSafe::Guard guard(300);
    if (!guard.isAcquired()) {
        Serial.printf("[ACCESS] MUTEX TIMEOUT for UID %s - cannot evaluate, denying\n", c_uid);
        return AccessResult::PENDING_REPEAT;
    }

    // 2️⃣ BLACKLIST → DENY
    if (NVSStore::isBlacklisted(c_uid)) {
        Serial.printf("[ACCESS] UID %s -> BLACKLISTED\n", c_uid);
        return AccessResult::DENY_BLACKLIST;
    }

    // 3️⃣ WHITELIST → GRANT
    if (NVSStore::isWhitelisted(c_uid)) {
        Serial.printf("[ACCESS] UID %s -> WHITELISTED (WL count=%d)\n", c_uid, NVSStore::whitelistCount());
        return AccessResult::GRANT;
    }

    // 4️⃣ UNKNOWN → ADD TO PENDING (ONCE)
    Serial.printf("[ACCESS] UID %s NOT in WL(%d) or BL(%d), adding to PENDING\n",
                  c_uid, NVSStore::whitelistCount(), NVSStore::blacklistCount());
    if (NVSStore::addToPending(c_uid)) {
        return AccessResult::PENDING_NEW;
    }

    // 5️⃣ ALREADY PENDING → DENY (SOFT)
    return AccessResult::PENDING_REPEAT;
}

// ================= STRING HELPERS =================
const char* AccessDecision::toString(AccessResult r) {
    switch (r) {
        case AccessResult::GRANT:           return "GRANT";
        case AccessResult::DENY_BLACKLIST:  return "DENY_BLACKLIST";
        case AccessResult::PENDING_NEW:     return "PENDING_NEW";
        case AccessResult::PENDING_REPEAT:  return "PENDING_REPEAT";
        case AccessResult::INVALID:         return "INVALID";
        default:                            return "UNKNOWN";
    }
}
