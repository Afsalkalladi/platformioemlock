#include "nvs_store.h"
#include <Preferences.h>

static Preferences prefs;

// Namespace names
static const char *NS_WHITELIST = "whitelist";
static const char *NS_BLACKLIST = "blacklist";
static const char *NS_PENDING   = "pending_seen";

namespace NVSStore {

  void begin() {
    // Nothing to initialize globally
    Serial.println("[NVS] Storage module ready");
  }

  // ================= WHITELIST =================

  bool isWhitelisted(const String &uid) {
    prefs.begin(NS_WHITELIST, true);
    bool exists = prefs.isKey(uid.c_str());
    prefs.end();
    return exists;
  }

  bool addToWhitelist(const String &uid, const String &name) {
    prefs.begin(NS_WHITELIST, false);
    bool ok = prefs.putString(uid.c_str(), name) > 0;
    prefs.end();
    return ok;
  }

  bool removeFromWhitelist(const String &uid) {
    prefs.begin(NS_WHITELIST, false);
    bool ok = prefs.remove(uid.c_str());
    prefs.end();
    return ok;
  }

  // ================= BLACKLIST =================

  bool isBlacklisted(const String &uid) {
    prefs.begin(NS_BLACKLIST, true);
    bool exists = prefs.isKey(uid.c_str());
    prefs.end();
    return exists;
  }

  bool addToBlacklist(const String &uid, const String &reason) {
    prefs.begin(NS_BLACKLIST, false);
    bool ok = prefs.putString(uid.c_str(), reason) > 0;
    prefs.end();
    return ok;
  }

  bool removeFromBlacklist(const String &uid) {
    prefs.begin(NS_BLACKLIST, false);
    bool ok = prefs.remove(uid.c_str());
    prefs.end();
    return ok;
  }

  // ================= PENDING =================

  bool isPendingSeen(const String &uid) {
    prefs.begin(NS_PENDING, true);
    bool exists = prefs.isKey(uid.c_str());
    prefs.end();
    return exists;
  }

  bool markPendingSeen(const String &uid) {
    prefs.begin(NS_PENDING, false);
    bool ok = prefs.putBool(uid.c_str(), true);
    prefs.end();
    return ok;
  }

  // ================= DEBUG DUMPS =================

  void dumpWhitelist() {
    prefs.begin(NS_WHITELIST, true);
    Serial.println("[NVS] Whitelist dump:");
    prefs.end(); // ESP32 does not allow key iteration safely; see note below
  }

  void dumpBlacklist() {
    prefs.begin(NS_BLACKLIST, true);
    Serial.println("[NVS] Blacklist dump:");
    prefs.end();
  }

  void dumpPending() {
    prefs.begin(NS_PENDING, true);
    Serial.println("[NVS] Pending dump:");
    prefs.end();
  }

}
