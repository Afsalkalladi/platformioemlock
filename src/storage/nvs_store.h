#pragma once
#include <Arduino.h>

namespace NVSStore {

  // Lifecycle
  void begin();

  // ---------- WHITELIST ----------
  bool isWhitelisted(const String &uid);
  bool addToWhitelist(const String &uid, const String &name);
  bool removeFromWhitelist(const String &uid);

  // ---------- BLACKLIST ----------
  bool isBlacklisted(const String &uid);
  bool addToBlacklist(const String &uid, const String &reason);
  bool removeFromBlacklist(const String &uid);

  // ---------- PENDING ----------
  bool isPendingSeen(const String &uid);
  bool markPendingSeen(const String &uid);

  // ---------- DEBUG ----------
  void dumpWhitelist();
  void dumpBlacklist();
  void dumpPending();
}
