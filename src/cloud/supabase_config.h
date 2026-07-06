#pragma once

// ============================================================================
// Supabase configuration
//
// SECURITY MODEL (after the RLS migration):
//   * The anon key is PUBLIC and harmless by itself - with RLS enabled it
//     grants access to NOTHING. It is only used as the PostgREST/Auth
//     "apikey" transport header.
//   * The device authenticates as its OWN Supabase Auth user
//     (DEVICE_EMAIL / DEVICE_PASSWORD). RLS limits that user to exactly:
//     read+ack its own commands, insert its own logs, upsert its own health.
//   * The old SUPABASE_KEY full-access pattern is GONE. Rotate the leaked
//     anon key in Dashboard -> Settings -> API and paste the NEW one below.
// ============================================================================

#define SUPABASE_URL  ""
#define SUPABASE_HOST ""   // for the Realtime websocket

// Paste the NEW (rotated) anon/publishable key here:
#define SUPABASE_ANON_KEY ""

// The device's own login (create this user: Dashboard -> Authentication ->
// Add user, e.g. device-lock1@devices.internal + a long random password,
// then map it: update devices set auth_user_id = '<that user uuid>' ...)
#define DEVICE_EMAIL    ""
#define DEVICE_PASSWORD ""
