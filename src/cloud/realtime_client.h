#pragma once

// Supabase Realtime (Phoenix websocket) subscriber.
// Listens for INSERTs on device_commands for THIS device and triggers an
// immediate command poll -> remote unlock reacts in well under a second.
// The normal HTTP poll (15 s) stays as a self-healing fallback.
class RealtimeClient {
public:
    static void init();
    static void update();   // call every loop()
    static bool isConnected();
};
