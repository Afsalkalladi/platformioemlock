#pragma once
#include <Arduino.h>

enum class AccessResult {
  GRANT,
  DENY_BLACKLIST,
  PENDING_NEW,
PENDING_REPEAT,
INVALID

};

namespace AccessDecision {
  AccessResult evaluate(const String &uid);
  const char* toString(AccessResult r);
}
