#pragma once
#include <Arduino.h>

enum class AccessResult {
  GRANT,
  DENY,
  PENDING,
  INVALID
};

namespace AccessDecision {
  AccessResult evaluate(const String &uid);
  const char* toString(AccessResult r);
}
