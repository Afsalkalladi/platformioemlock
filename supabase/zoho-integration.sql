-- ============================================================
-- ZOHO PEOPLE INTEGRATION - Run in Supabase SQL Editor
-- (run AFTER security-fix-v2.sql and unlock-speedup.sql)
-- ============================================================
-- Pushes RFID taps from access_logs into Zoho People attendance.
--
-- Flow:
--   ESP32 tap -> access_logs (already working)
--   -> pg_cron every 5 min -> Edge Function zoho-attendance-sync
--   -> Zoho People /attendance/bulkImport
--
-- Why batched and not real-time: Zoho's bulkImport allows only
-- 10 requests with a 5-minute lock period. One batched call every
-- 5 minutes stays far inside that, and the ESP32's existing offline
-- log buffer means nothing is lost if WiFi or Zoho is down.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- 1. UID -> Zoho employee mapping
-- ------------------------------------------------------------
-- You can skip this table entirely IF you set each employee's
-- "Mapper ID" in Zoho People to their RFID UID (Zoho's built-in
-- field for biometric/card terminals). The sync falls back to
-- mapId = UID when no row exists here.
CREATE TABLE IF NOT EXISTS public.zoho_employee_map (
  uid          TEXT PRIMARY KEY,          -- RFID UID, uppercase
  zoho_emp_id  TEXT NULL,                 -- Zoho "Employee ID"
  email        TEXT NULL,                 -- Zoho email (fallback)
  full_name    TEXT NULL,                 -- for the dashboard
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.zoho_employee_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zem_auth_all ON public.zoho_employee_map;
CREATE POLICY zem_auth_all ON public.zoho_employee_map
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ------------------------------------------------------------
-- 2. Sync tracking on access_logs
-- ------------------------------------------------------------
ALTER TABLE public.access_logs
  ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS zoho_status    TEXT NULL,   -- 'OK' | 'SKIPPED:reason' | 'FAILED:code'
  ADD COLUMN IF NOT EXISTS zoho_direction TEXT NULL;   -- 'checkIn' | 'checkOut'

-- Partial index: the sync only ever scans unsynced rows.
CREATE INDEX IF NOT EXISTS idx_access_logs_zoho_pending
  ON public.access_logs (logged_at)
  WHERE zoho_synced_at IS NULL;

-- ------------------------------------------------------------
-- 3. OAuth access-token cache
-- ------------------------------------------------------------
-- Edge Functions are stateless, so the hourly access token is
-- cached here instead of being re-minted on every invocation.
-- The long-lived refresh token stays in Edge Function secrets,
-- never in the database.
CREATE TABLE IF NOT EXISTS public.zoho_tokens (
  id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.zoho_tokens ENABLE ROW LEVEL SECURITY;
-- No policies at all: only service_role (the Edge Function) reads it.

-- ------------------------------------------------------------
-- 4. Build the pending attendance batch
-- ------------------------------------------------------------
-- Decides check-in vs check-out. With a single reader you can't
-- know direction from hardware, so taps alternate: 1st tap of the
-- day = checkIn, 2nd = checkOut, 3rd = checkIn, and so on.
-- Repeat taps inside p_debounce_seconds are dropped as accidental
-- double-swipes rather than flipping direction.
CREATE OR REPLACE FUNCTION public.zoho_pending_attendance(
  p_limit            INT DEFAULT 200,
  p_debounce_seconds INT DEFAULT 120
)
RETURNS TABLE (
  log_id      UUID,
  uid         TEXT,
  zoho_emp_id TEXT,
  email       TEXT,
  punched_at  TIMESTAMPTZ,
  direction   TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH granted AS (
    -- Only real card taps become attendance. REMOTE unlocks (widget)
    -- have no cardholder, and DENIED/PENDING aren't attendance events.
    SELECT al.id,
           UPPER(al.uid) AS uid,
           al.logged_at,
           -- IST calendar day decides which day the punch belongs to
           (al.logged_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
    FROM public.access_logs al
    WHERE al.event_type = 'GRANTED'
      AND al.zoho_synced_at IS NULL
      AND al.uid IS NOT NULL
      AND al.uid <> '-'
  ),
  debounced AS (
    SELECT g.*,
           LAG(g.logged_at) OVER (
             PARTITION BY g.uid, g.ist_day ORDER BY g.logged_at
           ) AS prev_at
    FROM granted g
  ),
  kept AS (
    SELECT d.*
    FROM debounced d
    WHERE d.prev_at IS NULL
       OR d.logged_at - d.prev_at > (p_debounce_seconds || ' seconds')::interval
  ),
  numbered AS (
    SELECT k.*,
           ROW_NUMBER() OVER (
             PARTITION BY k.uid, k.ist_day ORDER BY k.logged_at
           ) AS n
    FROM kept k
  )
  SELECT n.id,
         n.uid,
         m.zoho_emp_id,
         m.email,
         n.logged_at,
         CASE WHEN n.n % 2 = 1 THEN 'checkIn' ELSE 'checkOut' END
  FROM numbered n
  LEFT JOIN public.zoho_employee_map m
    ON m.uid = n.uid AND m.active
  ORDER BY n.logged_at
  LIMIT p_limit;
$$;

-- Mark debounced duplicates so they don't get rescanned forever.
CREATE OR REPLACE FUNCTION public.zoho_mark_debounced(p_debounce_seconds INT DEFAULT 120)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  WITH granted AS (
    SELECT al.id, UPPER(al.uid) AS uid, al.logged_at,
           (al.logged_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
    FROM public.access_logs al
    WHERE al.event_type = 'GRANTED'
      AND al.zoho_synced_at IS NULL
      AND al.uid IS NOT NULL
  ),
  d AS (
    SELECT g.id, g.logged_at,
           LAG(g.logged_at) OVER (PARTITION BY g.uid, g.ist_day ORDER BY g.logged_at) AS prev_at
    FROM granted g
  )
  UPDATE public.access_logs al
  SET zoho_synced_at = NOW(), zoho_status = 'SKIPPED:debounce'
  FROM d
  WHERE al.id = d.id
    AND d.prev_at IS NOT NULL
    AND d.logged_at - d.prev_at <= (p_debounce_seconds || ' seconds')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Non-attendance rows never need syncing; retire them in one pass.
CREATE OR REPLACE FUNCTION public.zoho_mark_non_attendance()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  UPDATE public.access_logs
  SET zoho_synced_at = NOW(), zoho_status = 'SKIPPED:not-attendance'
  WHERE zoho_synced_at IS NULL
    AND event_type <> 'GRANTED';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ------------------------------------------------------------
-- 5. Dashboard view: attendance sync status
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.zoho_sync_overview
WITH (security_invoker = on) AS
SELECT al.id,
       al.device_id,
       al.uid,
       COALESCE(m.full_name, '(unmapped)') AS employee,
       m.zoho_emp_id,
       al.logged_at,
       al.zoho_direction,
       al.zoho_status,
       al.zoho_synced_at
FROM public.access_logs al
LEFT JOIN public.zoho_employee_map m ON m.uid = UPPER(al.uid)
WHERE al.event_type = 'GRANTED'
ORDER BY al.logged_at DESC;

-- ============================================================
-- 6. SCHEDULE (edit the two placeholders, then run)
-- ============================================================
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running.
--
-- SELECT cron.schedule(
--   'zoho-attendance-sync',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/zoho-attendance-sync',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
--
-- Check it later:   SELECT * FROM cron.job;
-- Remove it:        SELECT cron.unschedule('zoho-attendance-sync');
-- Recent runs:      SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
