-- Add new columns for enhanced RFID health monitoring
-- Run this in Supabase SQL Editor

ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS rfid_soft_reset_count integer DEFAULT 0;

ALTER TABLE device_health 
ADD COLUMN IF NOT EXISTS last_successful_read_time timestamp with time zone;
