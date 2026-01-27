-- Add 'name' column to device_uids table for associating human-readable names with UIDs
-- Run this in Supabase SQL Editor

-- Add the name column
ALTER TABLE device_uids 
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;

-- Create an index for faster lookups by name (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_device_uids_name ON device_uids(name) WHERE name IS NOT NULL;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'device_uids';
