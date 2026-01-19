#pragma once

class SupabaseSync {
public:
    static void init();
    static void update();  // called from loop()
    
    // Full sync: upload all NVS data to Supabase
    static void syncAllToSupabase();
    
    // Call these after processing commands
    static void syncUidToSupabase(const char* uid, const char* state);  // WHITELIST, BLACKLIST
    static void removeUidFromSupabase(const char* uid);
    static void removePendingFromSupabase(const char* uid);
    static void addPendingToSupabase(const char* uid);
    
    // Log sync
    static void logToSupabase(const char* eventType, const char* uid, const char* info);
};
