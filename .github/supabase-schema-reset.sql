-- ========================================================
-- ESP32 RFID DATABASE - COMPLETE RESET & REBUILD
-- ========================================================
-- Paste this entire file into Supabase SQL Editor
-- This will drop everything and recreate from scratch
-- ========================================================

-- 0️⃣ EXTENSIONS
-- --------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1️⃣ DROP EVERYTHING (CLEAN SLATE)
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_device_uids ON device_commands;
DROP TRIGGER IF EXISTS trg_set_acked_at ON device_commands;

DROP FUNCTION IF EXISTS sync_device_uids_from_commands();
DROP FUNCTION IF EXISTS set_acked_at();

DROP VIEW IF EXISTS device_overview;

DROP TABLE IF EXISTS device_pending_reports CASCADE;
DROP TABLE IF EXISTS device_uids CASCADE;
DROP TABLE IF EXISTS device_commands CASCADE;
DROP TABLE IF EXISTS devices CASCADE;

-- 2️⃣ DEVICES TABLE (Source of Truth)
-- --------------------------------------------------------
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  notes TEXT
);

-- 3️⃣ DEVICE COMMANDS (Core Control Pipeline)
-- --------------------------------------------------------
CREATE TABLE device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  
  type TEXT NOT NULL,
  uid TEXT NULL,
  payload JSONB NULL,
  
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acked_at TIMESTAMPTZ NULL,
  
  CONSTRAINT status_check CHECK (
    status IN ('PENDING', 'DONE', 'FAILED')
  ),
  
  CONSTRAINT type_check CHECK (
    type IN (
      'REMOTE_UNLOCK',
      'WHITELIST_ADD',
      'BLACKLIST_ADD',
      'REMOVE_UID',
      'GET_PENDING',
      'SYNC_UIDS'
    )
  )
);

-- Index for ESP32 polling
CREATE INDEX idx_device_pending 
ON device_commands (device_id, status, created_at);

CREATE INDEX idx_device_commands_created 
ON device_commands (created_at DESC);

-- 4️⃣ DEVICE UIDs (Cloud Mirror of Whitelist/Blacklist)
-- --------------------------------------------------------
CREATE TABLE device_uids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  
  state TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uid_unique_per_device UNIQUE (device_id, uid),
  
  CONSTRAINT state_check CHECK (
    state IN ('WHITELIST', 'BLACKLIST')
  )
);

CREATE INDEX idx_device_uids_lookup 
ON device_uids (device_id, state);

-- 5️⃣ ACCESS LOGS (RFID Scan Events)
-- --------------------------------------------------------
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT event_type_check CHECK (
    event_type IN ('GRANTED', 'DENIED', 'PENDING', 'REMOTE')
  )
);

CREATE INDEX idx_access_logs_device 
ON access_logs (device_id, logged_at DESC);

-- 6️⃣ TRIGGER: Auto-set acked_at timestamp
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION set_acked_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DONE' AND OLD.status <> 'DONE' THEN
    NEW.acked_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_acked_at
BEFORE UPDATE ON device_commands
FOR EACH ROW
EXECUTE FUNCTION set_acked_at();

-- 7️⃣ TRIGGER: Auto-sync device_uids from commands
-- --------------------------------------------------------
-- This keeps device_uids table in sync when commands complete
CREATE OR REPLACE FUNCTION sync_device_uids_from_commands()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when command transitions to DONE
  IF NEW.status = 'DONE' AND OLD.status <> 'DONE' THEN
    
    -- WHITELIST_ADD
    IF NEW.type = 'WHITELIST_ADD' AND NEW.uid IS NOT NULL THEN
      INSERT INTO device_uids (device_id, uid, state)
      VALUES (NEW.device_id, NEW.uid, 'WHITELIST')
      ON CONFLICT (device_id, uid) 
      DO UPDATE SET state = 'WHITELIST', updated_at = NOW();
    
    -- BLACKLIST_ADD
    ELSIF NEW.type = 'BLACKLIST_ADD' AND NEW.uid IS NOT NULL THEN
      INSERT INTO device_uids (device_id, uid, state)
      VALUES (NEW.device_id, NEW.uid, 'BLACKLIST')
      ON CONFLICT (device_id, uid)
      DO UPDATE SET state = 'BLACKLIST', updated_at = NOW();
    
    -- REMOVE_UID
    ELSIF NEW.type = 'REMOVE_UID' AND NEW.uid IS NOT NULL THEN
      DELETE FROM device_uids 
      WHERE device_id = NEW.device_id AND uid = NEW.uid;
    
    -- SYNC_UIDS (full replace)
    ELSIF NEW.type = 'SYNC_UIDS' AND NEW.payload IS NOT NULL THEN
      -- Clear existing UIDs for this device
      DELETE FROM device_uids WHERE device_id = NEW.device_id;
      
      -- Insert whitelist (if exists)
      IF NEW.payload ? 'whitelist' THEN
        INSERT INTO device_uids (device_id, uid, state)
        SELECT NEW.device_id, jsonb_array_elements_text(NEW.payload->'whitelist'), 'WHITELIST';
      END IF;
      
      -- Insert blacklist (if exists)
      IF NEW.payload ? 'blacklist' THEN
        INSERT INTO device_uids (device_id, uid, state)
        SELECT NEW.device_id, jsonb_array_elements_text(NEW.payload->'blacklist'), 'BLACKLIST';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_device_uids
AFTER UPDATE ON device_commands
FOR EACH ROW
EXECUTE FUNCTION sync_device_uids_from_commands();

-- 8️⃣ VIEW: Device Overview (for dashboard)
-- --------------------------------------------------------
CREATE OR REPLACE VIEW device_overview AS
SELECT
  d.device_id,
  MAX(c.created_at) AS last_command_at,
  COUNT(c.*) FILTER (WHERE c.status = 'PENDING') AS pending_commands
FROM devices d
LEFT JOIN device_commands c ON c.device_id = d.device_id
GROUP BY d.device_id;

-- 9️⃣ SUCCESS MESSAGE
-- --------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ Database reset complete!';
  RAISE NOTICE '📋 Tables created: devices, device_commands, device_uids, access_logs';
  RAISE NOTICE '⚡ Triggers active: auto-ack, auto-sync UIDs';
  RAISE NOTICE '👀 View created: device_overview';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Ready for ESP32 + Admin Dashboard';
END $$;
