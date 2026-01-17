#include "access_decision.h"
#include "../storage/nvs_store.h"

// Simple UID validation (can be strengthened later)
static bool isValidUID(const String &uid) {
  if (uid.length() < 4 || uid.length() > 16) return false;

  for (char c : uid) {
    if (!isxdigit(c)) return false;
  }
  return true;
}

namespace AccessDecision {

  AccessResult evaluate(const String &uid) {

    // 1️⃣ INVALID UID
    if (!isValidUID(uid)) {
      return AccessResult::INVALID;
    }

    // 2️⃣ BLACKLIST
    if (NVSStore::isBlacklisted(uid)) {
      return AccessResult::DENY;
    }

    // 3️⃣ WHITELIST
    if (NVSStore::isWhitelisted(uid)) {
      return AccessResult::GRANT;
    }

    // 4️⃣ PENDING (first time)
    if (!NVSStore::isPendingSeen(uid)) {
      NVSStore::markPendingSeen(uid);
      return AccessResult::PENDING;
    }

    // 5️⃣ ALREADY PENDING → DENY
    return AccessResult::DENY;
  }

  const char* toString(AccessResult r) {
    switch (r) {
      case AccessResult::GRANT:   return "GRANT";
      case AccessResult::DENY:    return "DENY";
      case AccessResult::PENDING: return "PENDING";
      case AccessResult::INVALID: return "INVALID";
      default:                   return "UNKNOWN";
    }
  }

}
