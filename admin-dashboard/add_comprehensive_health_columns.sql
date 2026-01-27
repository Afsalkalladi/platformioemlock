-- ========================================================
-- Add Comprehensive Health Monitoring Columns
-- ========================================================
-- Run this in Supabase SQL Editor to add all health monitoring fields
-- ========================================================

-- Add memory information columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS total_heap_bytes INTEGER,
ADD COLUMN IF NOT EXISTS min_free_heap_bytes INTEGER,
ADD COLUMN IF NOT EXISTS largest_free_block_bytes INTEGER;

-- Add processor information columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS cpu_freq_mhz INTEGER,
ADD COLUMN IF NOT EXISTS chip_model INTEGER,
ADD COLUMN IF NOT EXISTS chip_revision INTEGER,
ADD COLUMN IF NOT EXISTS chip_cores INTEGER;

-- Add Core 0 status columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS core0_id INTEGER,
ADD COLUMN IF NOT EXISTS core0_is_idle BOOLEAN,
ADD COLUMN IF NOT EXISTS core0_current_task TEXT,
ADD COLUMN IF NOT EXISTS core0_free_stack_bytes INTEGER,
ADD COLUMN IF NOT EXISTS core0_cpu_usage_percent REAL;

-- Add Core 1 status columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS core1_id INTEGER,
ADD COLUMN IF NOT EXISTS core1_is_idle BOOLEAN,
ADD COLUMN IF NOT EXISTS core1_current_task TEXT,
ADD COLUMN IF NOT EXISTS core1_free_stack_bytes INTEGER,
ADD COLUMN IF NOT EXISTS core1_cpu_usage_percent REAL;

-- Add storage information columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS storage_littlefs_total_bytes INTEGER,
ADD COLUMN IF NOT EXISTS storage_littlefs_used_bytes INTEGER,
ADD COLUMN IF NOT EXISTS storage_littlefs_free_bytes INTEGER,
ADD COLUMN IF NOT EXISTS storage_nvs_used_entries INTEGER;

-- Add watchdog information columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS watchdog_enabled BOOLEAN,
ADD COLUMN IF NOT EXISTS watchdog_timeout_ms INTEGER;

-- Add task information (stored as JSONB for flexibility)
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS tasks JSONB,
ADD COLUMN IF NOT EXISTS task_count INTEGER;

-- Add RFID soft reset count (if not already present)
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS rfid_soft_reset_count INTEGER DEFAULT 0;

-- Add last successful read time (if not already present)
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS last_successful_read_time TIMESTAMPTZ;

-- Add comprehensive RFID health columns
ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS rfid_communication_ok BOOLEAN,
ADD COLUMN IF NOT EXISTS rfid_antenna_on BOOLEAN,
ADD COLUMN IF NOT EXISTS rfid_antenna_gain INTEGER,
ADD COLUMN IF NOT EXISTS rfid_tx_control INTEGER,
ADD COLUMN IF NOT EXISTS rfid_status1 INTEGER,
ADD COLUMN IF NOT EXISTS rfid_status2 INTEGER,
ADD COLUMN IF NOT EXISTS rfid_com_irq INTEGER,
ADD COLUMN IF NOT EXISTS rfid_poll_count INTEGER;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Comprehensive health monitoring columns added!';
  RAISE NOTICE '📋 All health data fields are now available';
END $$;
