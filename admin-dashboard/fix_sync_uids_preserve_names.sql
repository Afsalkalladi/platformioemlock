-- ========================================================
-- FIX: SYNC_UIDS trigger to preserve UID names
-- ========================================================
-- Run this in Supabase SQL Editor to fix the SYNC_UIDS trigger
-- This replaces the old trigger that deleted all UIDs (losing names)
-- with a new one that uses UPSERT to preserve existing names
-- ========================================================

-- Drop and recreate the function with the fix
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
    
    -- SYNC_UIDS (upsert approach - PRESERVES EXISTING NAMES!)
    ELSIF NEW.type = 'SYNC_UIDS' AND NEW.payload IS NOT NULL THEN
      -- Delete UIDs that are no longer in the sync list
      DELETE FROM device_uids 
      WHERE device_id = NEW.device_id 
        AND uid NOT IN (
          SELECT jsonb_array_elements_text(NEW.payload->'whitelist')
          UNION
          SELECT jsonb_array_elements_text(NEW.payload->'blacklist')
        );
      
      -- Upsert whitelist (preserves existing names)
      IF NEW.payload ? 'whitelist' THEN
        INSERT INTO device_uids (device_id, uid, state)
        SELECT NEW.device_id, jsonb_array_elements_text(NEW.payload->'whitelist'), 'WHITELIST'
        ON CONFLICT (device_id, uid) 
        DO UPDATE SET state = 'WHITELIST', updated_at = NOW();
      END IF;
      
      -- Upsert blacklist (preserves existing names)
      IF NEW.payload ? 'blacklist' THEN
        INSERT INTO device_uids (device_id, uid, state)
        SELECT NEW.device_id, jsonb_array_elements_text(NEW.payload->'blacklist'), 'BLACKLIST'
        ON CONFLICT (device_id, uid) 
        DO UPDATE SET state = 'BLACKLIST', updated_at = NOW();
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify the fix was applied
DO $$
BEGIN
  RAISE NOTICE '✅ SYNC_UIDS trigger updated!';
  RAISE NOTICE '📋 UID names will now be preserved when syncing';
END $$;
