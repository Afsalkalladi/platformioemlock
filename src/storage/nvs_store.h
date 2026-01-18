#pragma once

#include <Arduino.h>
#include <Preferences.h>

enum class UIDState : uint8_t {
    NONE = 0,
    WHITELIST,
    BLACKLIST,
    PENDING
};

class NVSStore {
public:
    static void init();

    // Queries
    static bool isWhitelisted(const char* uid);
    static bool isBlacklisted(const char* uid);
    static bool isPending(const char* uid);

    static UIDState getState(const char* uid);

    // Mutations (mutually exclusive)
    static bool addToWhitelist(const char* uid);
    static bool addToBlacklist(const char* uid);
    static bool addToPending(const char* uid);

    static void removeUID(const char* uid);

    // SYNC helpers (REQUIRED)
    static void clearWhitelist();
    static void clearBlacklist();

    // Factory reset
    static void factoryReset();

    // Capacity
    static uint8_t whitelistCount();
    static uint8_t blacklistCount();
    static uint8_t pendingCount();



private:
    static Preferences wl;
    static Preferences bl;
    static Preferences pd;

    static bool addExclusive(Preferences& target, const char* uid,bool bypassLimit);
};
