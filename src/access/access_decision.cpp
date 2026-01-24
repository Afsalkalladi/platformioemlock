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
        return AccessResult::INVALID;
    }

    const char* c_uid = uid.c_str();

    // CRITICAL: Lock mutex to prevent race condition with Core 0 accessing NVS
    ThreadSafe::Guard guard(100);  // 100ms timeout
    if (!guard.isAcquired()) {
        Serial.println("[ACCESS] Failed to acquire mutex, defaulting to PENDING");
        return AccessResult::PENDING_REPEAT;
    }

    // 2️⃣ BLACKLIST → DENY
    if (NVSStore::isBlacklisted(c_uid)) {
        return AccessResult::DENY_BLACKLIST;
    }

    // 3️⃣ WHITELIST → GRANT
    if (NVSStore::isWhitelisted(c_uid)) {
        return AccessResult::GRANT;
    }

    // 4️⃣ UNKNOWN → ADD TO PENDING (ONCE)
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
