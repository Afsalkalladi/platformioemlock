========================================================
ESP32 RFID DOOR LOCK SYSTEM
COPILOT CONTINUATION MANUAL (AUTHORITATIVE)
========================================================

READ THIS FULLY BEFORE TOUCHING CODE OR DATABASE.
PENDING LOGIC IS SUBTLE. BREAK IT ONCE AND YOU WILL
DEBUG PHANTOMS FOR DAYS.

========================================================
0️⃣ ONE-LINE SYSTEM SUMMARY (ALWAYS READ FIRST)
========================================================

This is an ESP32-based RFID door lock system using Supabase
as a COMMAND QUEUE backend.

The ESP32 NEVER pulls UI state directly.
It ONLY executes rows from `device_commands` and ACKs them.

If any suggestion violates this → STOP IMMEDIATELY.

========================================================
1️⃣ CORE ARCHITECTURE (NON-NEGOTIABLE)
========================================================

AUTHORITY MODEL
--------------------------------------------------------
Component          Authority
--------------------------------------------------------
ESP32              Executes commands only
Supabase (Postgres) Source of truth
Admin Dashboard    Issues commands ONLY
ESP32 NVS          Local cache (disposable)

GOLDEN RULE
--------------------------------------------------------
NO frontend writes directly to device state.
NO device writes business logic to the DB.
EVERYTHING flows through device_commands.

If Copilot suggests bypassing this → reject.

========================================================
2️⃣ UID STATES (WHAT THEY ACTUALLY MEAN)
========================================================

State        Lives Where        Meaning
--------------------------------------------------------
PENDING      ESP32 NVS ONLY     Unknown card, decision needed
WHITELIST    Supabase + ESP32   Explicitly allowed
BLACKLIST    Supabase + ESP32   Explicitly denied
NONE         Nowhere            Unknown / removed

IMPORTANT:
PENDING IS NOT AUTHORITATIVE.
It is a TEMPORARY OBSERVATION BUFFER.

========================================================
3️⃣ RFID FLOW (FINAL & LOCKED)
========================================================

On RFID Scan:
--------------------------------------------------------
1. Validate UID format
2. Check NVS:
   - In WHITELIST  → unlock door
   - In BLACKLIST  → deny access
   - Unknown       → add to PENDING
3. Emit buzzer + log
4. DO NOT talk to Supabase here

The device NEVER contacts Supabase during scan.

========================================================
4️⃣ PENDING UID LOGIC (CRITICAL – DO NOT MODIFY)
========================================================

PENDING UID RULES
--------------------------------------------------------
- Stored ONLY on ESP32 (NVS namespace: `pd`)
- NEVER synced FROM server
- EXISTS so admin can decide LATER
- CLEARED on SYNC_UIDS (intentionally)

PENDING CAPTURE FLOW
--------------------------------------------------------
RFID scan
→ UID not in WL/BL
→ addToPending(uid)
→ buzzer: PENDING
→ door stays locked

========================================================
5️⃣ PENDING LIFECYCLE (CORRECT FLOW)
========================================================

STEP 1: ADMIN FETCHES PENDING
--------------------------------------------------------
Admin inserts:

INSERT INTO device_commands (device_id, type)
VALUES ('<DEVICE_ID>', 'GET_PENDING');

Device:
- Reads pending from NVS
- Returns JSON array in `result`
- ACKs command ONCE

STEP 2: ADMIN DECIDES
--------------------------------------------------------
For each UID:

Whitelist:
INSERT INTO device_commands (device_id, type, uid)
VALUES ('<DEVICE_ID>', 'WHITELIST_ADD', '<UID>');

Blacklist:
INSERT INTO device_commands (device_id, type, uid)
VALUES ('<DEVICE_ID>', 'BLACKLIST_ADD', '<UID>');

Remove:
INSERT INTO device_commands (device_id, type, uid)
VALUES ('<DEVICE_ID>', 'REMOVE_UID', '<UID>');

Device guarantees:
- UID removed from PENDING
- UID exists in ONE namespace only

========================================================
6️⃣ SYNC_UIDS (AUTHORITATIVE RESET)
========================================================

SYNC_UIDS MEANS:
"Forget everything local. Rebuild from server truth."

MANDATORY ORDER
--------------------------------------------------------
1. clearWhitelist()
2. clearBlacklist()
3. Apply whitelist payload
4. Apply blacklist payload
5. clearPending()
6. ACK command

YES, PENDING IS LOST.
THIS IS INTENTIONAL.
DO NOT CHANGE THIS.

Payload format:
{
  "whitelist": ["A1B2C3D4"],
  "blacklist": ["11223344"]
}

========================================================
7️⃣ COMMAND SYSTEM RULES (ABSOLUTE)
========================================================

COMMAND BEHAVIOR
--------------------------------------------------------
- Sequential
- Idempotent
- ACK-required

ESP32 MUST:
--------------------------------------------------------
- Poll every ~3 seconds
- Process ONE command at a time
- ACK exactly once
- Persist lastAckedCmdId in NVS
- Never re-execute ACKed commands

Duplicate guard (MANDATORY):
--------------------------------------------------------
if (lastAckedCmd == cmdId) return;

ESP32 MUST NOT:
--------------------------------------------------------
- Batch commands
- Execute in parallel
- Trust frontend input
- Use websockets / realtime
- Assume reliable internet

========================================================
8️⃣ DATABASE CONTRACT (DO NOT BREAK)
========================================================

device_commands (COMMAND QUEUE)
--------------------------------------------------------
One row = one instruction

Required columns:
- id (uuid)
- device_id
- type
- uid (nullable)
- payload (jsonb)
- status
- result
- created_at
- acked_at

Allowed `type` values:
--------------------------------------------------------
REMOTE_UNLOCK
WHITELIST_ADD
BLACKLIST_ADD
REMOVE_UID
GET_PENDING
SYNC_UIDS

If you add a command:
- Update DB constraint
- Update firmware switch
- Update admin UI
ALL THREE OR NOTHING.

device_uids (SERVER STATE)
--------------------------------------------------------
- Used ONLY by admin UI
- Device NEVER reads this table directly
- States: WHITELIST, BLACKLIST

========================================================
9️⃣ NVS STORAGE CONTRACT
========================================================

Namespaces:
--------------------------------------------------------
wl   → whitelist
bl   → blacklist
pd   → pending
sys  → metadata (lastAckedCmdId)

Guarantees:
--------------------------------------------------------
- UID exists in ONE namespace only
- Counts are accurate
- Pending iterable via nvs_entry_find

========================================================
🔟 WHAT NOT TO DO (EVER)
========================================================

❌ Do NOT auto-approve pending
❌ Do NOT sync pending from cloud
❌ Do NOT whitelist without UID
❌ Do NOT modify NVS from frontend
❌ Do NOT skip ACK
❌ Do NOT keep pending across SYNC_UIDS
❌ Do NOT invent new sync logic

========================================================
1️⃣1️⃣ ADMIN DASHBOARD RESPONSIBILITIES
========================================================

Admin UI CAN:
--------------------------------------------------------
- Insert commands
- View command status
- View pending UIDs
- Approve / deny pending
- Trigger SYNC_UIDS

Admin UI CANNOT:
--------------------------------------------------------
- Write device memory
- Assume execution success
- Modify ESP32 behavior

Everything is ASYNC.
UI must respect PENDING / DONE / FAILED.

========================================================
1️⃣2️⃣ DEBUGGING CHECKLIST
========================================================

If commands loop:
--------------------------------------------------------
- ACK PATCH failing
- lastAckedCmdId not persisted
- Duplicate guard missing

If UID misbehaves:
--------------------------------------------------------
- Pending not cleared on sync
- Wrong NVS namespace
- UID format mismatch

If dashboard lies:
--------------------------------------------------------
- Duplicate PENDING commands
- No ordering by created_at
- UI assuming instant execution

========================================================
1️⃣3️⃣ FINAL PRINCIPLE (MEMORIZE THIS)
========================================================

THE DEVICE OBSERVES.
THE ADMIN DECIDES.
THE SERVER REMEMBERS.

If a change violates this → REJECT IT.
========================================================
