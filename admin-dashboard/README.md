# ESP32 RFID Admin Dashboard

Internal admin dashboard for managing ESP32-based RFID door lock systems.

## Architecture

This dashboard follows a **command queue pattern**:

- ESP32 polls Supabase for commands
- Admin UI inserts commands
- ESP32 executes and ACKs
- UI polls for status updates

**NO realtime subscriptions. NO optimistic UI. NO lies.**

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
cp .env.local.example .env.local
```

3. Add your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

4. Run development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Schema Required

This dashboard expects these Supabase tables:

### `device_commands`

```sql
CREATE TABLE device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('REMOTE_UNLOCK', 'WHITELIST_ADD', 'BLACKLIST_ADD', 'REMOVE_UID', 'SYNC_UIDS', 'GET_PENDING')),
  uid TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'FAILED')),
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acked_at TIMESTAMPTZ
);

CREATE INDEX idx_device_commands_device_status ON device_commands(device_id, status);
CREATE INDEX idx_device_commands_created ON device_commands(created_at DESC);
```

### `device_uids`

```sql
CREATE TABLE device_uids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('WHITELIST', 'BLACKLIST')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, uid)
);
```

### `device_pending_reports` (optional, populated by GET_PENDING)

```sql
CREATE TABLE device_pending_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Pages

- `/devices` - List all devices
- `/devices/[id]` - Device detail with tabs:
  - Pending UIDs (approve/reject)
  - Whitelist
  - Blacklist
  - Command history

## Button State Machine

All action buttons follow this pattern:

1. **Idle** → clickable
2. **Pending** → disabled, shows ⏳
3. **Done** → shows ✓, re-enables after 2s
4. **Failed** → shows ✗, re-enables after 3s

## Polling Strategy

- Devices list: every 5s
- Device detail: every 5s
- Command status: every 1s (while pending)

**No WebSockets. No Realtime subscriptions.**

## Important Rules

❌ Do NOT modify device state directly
❌ Do NOT assume command success
❌ Do NOT add optimistic UI

✅ Always insert commands
✅ Always wait for ACK
✅ Always poll for updates

See `.github/copilot-instructions.md` for full architecture.

## Production Checklist

Before deploying:

- [ ] Add Supabase RLS policies
- [ ] Add authentication
- [ ] Restrict anon key permissions
- [ ] Add error boundaries
- [ ] Add logging
- [ ] Test offline behavior
- [ ] Test command timeout handling
