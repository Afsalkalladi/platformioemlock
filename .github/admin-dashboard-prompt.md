# 🔥 NEXT.JS ADMIN DASHBOARD — MVP PROMPT

```
Act as a senior full-stack engineer.

I am building an INTERNAL ADMIN DASHBOARD for an ESP32-based RFID door lock system.

This dashboard is NOT public-facing.
It is for trusted admins only.
Keep the design simple, fast, and boring (utility > beauty).

TECH STACK:
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Postgres + REST + JS client)
- No realtime subscriptions (polling is OK)
- No heavy UI libraries

GOALS:
- Send commands to devices
- View pending RFID cards
- Approve or reject cards
- Sync UID lists
- Monitor device activity

------------------------------------
DATABASE TABLES (EXISTING)
------------------------------------

1) device_commands
- id (uuid)
- device_id (text)
- type (REMOTE_UNLOCK | WHITELIST_ADD | BLACKLIST_ADD | REMOVE_UID | SYNC_UIDS | GET_PENDING)
- uid (text, nullable)
- payload (jsonb, nullable)
- status (PENDING | DONE | FAILED)
- result (text)
- created_at (timestamptz)
- acked_at (timestamptz)

2) device_uids
- id (uuid)
- device_id (text)
- uid (text)
- state (WHITELIST | BLACKLIST)
- updated_at (timestamptz)

3) device_pending_reports (optional, if used)
- id (uuid)
- device_id (text)
- uid (text)
- created_at (timestamptz)

------------------------------------
PAGES REQUIRED (MVP)
------------------------------------

1) /devices
- List all devices
- Columns:
  - device_id
  - last_seen (derived)
  - whitelist count
  - blacklist count
  - pending count
- Clicking a device opens its detail page

2) /devices/[device_id]
- Show device summary
- Buttons:
  - REMOTE UNLOCK
  - SYNC_UIDS
  - GET_PENDING
- Sections:
  - Pending UIDs
  - Whitelisted UIDs
  - Blacklisted UIDs

3) Pending UID Actions
For each pending UID:
- Approve → sends WHITELIST_ADD command
- Reject → sends BLACKLIST_ADD command
- Remove → sends REMOVE_UID command

------------------------------------
COMMAND BEHAVIOR
------------------------------------

- All actions create a row in device_commands with status = PENDING
- Device polls and ACKs commands
- UI polls command status and updates automatically
- Prevent duplicate commands while one is pending

------------------------------------
UX RULES
------------------------------------

- Show loading states
- Disable buttons while command is pending
- Show command result / error inline
- No modal overload
- Prefer tables over cards
- Poll every 3–5 seconds

------------------------------------
SECURITY (MVP LEVEL)
------------------------------------

- Assume admin is already authenticated
- No public access
- No role management UI required

------------------------------------
DELIVERABLE
------------------------------------

Generate:
- Folder structure (app router)
- Supabase client setup
- Core pages and components
- Data fetching logic
- Command creation helpers
- Minimal Tailwind styling

Do NOT:
- Over-engineer
- Add realtime
- Add unnecessary abstractions
```

---

## 🧠 WHY THIS PROMPT WORKS

* Matches **your exact firmware logic**
* Uses **command queue**, not direct writes
* Treats ESP32 as **eventual-consistency device**
* Keeps UI **admin-first**, not user-pretty
* Scales to multiple devices cleanly

---

## ✅ WHAT TO DO AFTER GENERATION

1. **Verify command insertions** → ESP32 reacts
2. **Verify ACK updates UI**
3. **Test pending → whitelist flow end-to-end**
4. Only then:

   * Add polish
   * Add auth hardening
   * Add logs page

---

## ⚠️ FINAL ADVICE

Do **NOT**:

* Add realtime now
* Add fancy UI kits
* Add role systems
* Touch firmware again unless a bug appears

Your firmware is **good enough**.
Now build the **control surface**.
