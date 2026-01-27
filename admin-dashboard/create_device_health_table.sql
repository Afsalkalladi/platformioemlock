-- ========================================================
-- Device Health Monitoring Table
-- ========================================================
-- Run this in Supabase SQL Editor to add health monitoring
-- ========================================================

-- Create the device_health table
CREATE TABLE IF NOT EXISTS device_health (
  device_id TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  
  -- System Health
  uptime_seconds INTEGER DEFAULT 0,
  free_heap_bytes INTEGER DEFAULT 0,
  wifi_rssi INTEGER DEFAULT 0,
  wifi_connected BOOLEAN DEFAULT false,
  ntp_synced BOOLEAN DEFAULT false,
  wifi_disconnect_count INTEGER DEFAULT 0,
  
  -- RFID Health
  rfid_healthy BOOLEAN DEFAULT true,
  rfid_version INTEGER DEFAULT 0,
  rfid_reinit_count INTEGER DEFAULT 0,
  last_rfid_error TEXT,
  last_rfid_error_time TIMESTAMPTZ,
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_device_health_updated ON device_health(updated_at DESC);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_health_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_health_timestamp ON device_health;
CREATE TRIGGER trg_device_health_timestamp
BEFORE UPDATE ON device_health
FOR EACH ROW
EXECUTE FUNCTION update_device_health_timestamp();

-- Enable RLS (Row Level Security) but allow public access for now
ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;

-- Allow inserts and updates (for ESP32)
CREATE POLICY "Allow device health inserts" ON device_health
  FOR INSERT WITH CHECK (true);
  
CREATE POLICY "Allow device health updates" ON device_health
  FOR UPDATE USING (true);
  
CREATE POLICY "Allow device health selects" ON device_health
  FOR SELECT USING (true);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Device health table created!';
  RAISE NOTICE '📋 Health data will be visible on the dashboard';
END $$;
