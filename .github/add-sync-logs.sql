-- ========================================================
-- ADD SYNC_LOGS COMMAND TYPE
-- Run this in Supabase SQL Editor to add SYNC_LOGS support
-- ========================================================

-- First, drop the existing constraint
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS type_check;

-- Add new constraint with SYNC_LOGS
ALTER TABLE device_commands ADD CONSTRAINT type_check CHECK (
  type IN (
    'REMOTE_UNLOCK',
    'WHITELIST_ADD',
    'BLACKLIST_ADD',
    'REMOVE_UID',
    'GET_PENDING',
    'SYNC_UIDS',
    'SYNC_LOGS'
  )
);

-- Verify the access_logs table exists (should already be there)
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT event_type_check CHECK (
    event_type IN ('GRANTED', 'DENIED', 'PENDING', 'REMOTE')
  )
);

CREATE INDEX IF NOT EXISTS idx_access_logs_device 
ON access_logs (device_id, logged_at DESC);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ SYNC_LOGS command type added!';
  RAISE NOTICE '✅ access_logs table ready!';
END $$;
