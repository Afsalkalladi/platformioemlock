-- ============================================================================
-- EM-Lock: security lockdown + employees/attendance + unlock keys
-- Run this ONCE in Supabase Dashboard -> SQL Editor.
-- Safe to re-run (idempotent where possible).
--
-- What this does:
--   1. New tables: employees, unlock_keys
--   2. New columns: device_uids.employee_id, device_commands.issued_by,
--      devices.auth_user_id
--   3. Fixes linter findings: enables RLS everywhere, drops always-true
--      policies, security_invoker on views, pins function search_path
--   4. Attendance view (IST, scans between 06:00-24:00)
--   5. Adds device_commands to the Realtime publication (for push unlock)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. NEW TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- One employee can have MANY cards: device_uids rows point at an employee.
alter table public.device_uids
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_device_uids_employee on public.device_uids(employee_id);

-- Unlock keys for widgets (iOS Shortcuts / Tasker / PWA page).
-- Only the SHA-256 hash is stored; the plaintext key is shown once at creation.
create table if not exists public.unlock_keys (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  key_hash     text not null unique,          -- sha256 hex of the plaintext key
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);

-- Who triggered a command ("admin-dashboard" or an unlock-key label)
alter table public.device_commands
  add column if not exists issued_by text;

-- Each physical device gets its own Supabase Auth user; map it here.
alter table public.devices
  add column if not exists auth_user_id uuid unique;

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS (pinned search_path so the linter is happy)
-- ---------------------------------------------------------------------------

-- The single admin. If you ever change the admin email, update it here.
create or replace function public.is_admin()
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@sketchrobotics.in'
$$;

-- Which device is the current JWT? (null for admin / others)
create or replace function public.current_device_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select device_id from public.devices where auth_user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 3. FIX EXISTING LINTER FINDINGS
-- ---------------------------------------------------------------------------

-- 3a. Pin search_path on the three flagged functions (signatures may vary,
--     so each is attempted independently and skipped if not found).
do $$
begin
  begin
    execute 'alter function public.update_device_health_timestamp() set search_path = public';
  exception when undefined_function then
    raise notice 'update_device_health_timestamp() not found - skipped';
  end;
  begin
    execute 'alter function public.set_acked_at() set search_path = public';
  exception when undefined_function then
    raise notice 'set_acked_at() not found - skipped';
  end;
  begin
    execute 'alter function public.sync_device_uids_from_commands() set search_path = public';
  exception when undefined_function then
    raise notice 'sync_device_uids_from_commands() not found - skipped';
  end;
end $$;

-- 3b. device_overview: run with the caller's permissions, not the creator's.
do $$
begin
  execute 'alter view public.device_overview set (security_invoker = on)';
exception when undefined_table then
  raise notice 'device_overview view not found - skipped';
end $$;

-- 3c. Drop ALL existing policies in public (removes the two always-true
--     device_health policies; we recreate everything properly below).
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. ENABLE RLS ON EVERYTHING
-- ---------------------------------------------------------------------------

alter table public.devices         enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_uids     enable row level security;
alter table public.device_logs     enable row level security;
alter table public.access_logs     enable row level security;
alter table public.device_health   enable row level security;
alter table public.employees       enable row level security;
alter table public.unlock_keys     enable row level security;

-- ---------------------------------------------------------------------------
-- 5. POLICIES
--    * admin (your email) -> full access to everything
--    * device auth user   -> only what the firmware needs, only its own rows
--    * anon               -> NOTHING (the leaked anon key becomes useless)
--    * service_role       -> bypasses RLS (used by the Vercel unlock API)
-- ---------------------------------------------------------------------------

-- ===== admin: full access =====
create policy admin_all_devices         on public.devices         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_device_commands on public.device_commands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_device_uids     on public.device_uids     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_device_logs     on public.device_logs     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_access_logs     on public.access_logs     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_device_health   on public.device_health   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_employees       on public.employees       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_unlock_keys     on public.unlock_keys     for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===== device: narrow, own rows only =====

-- devices: read + heartbeat-update its own row
create policy device_select_self on public.devices
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy device_update_self on public.devices
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- device_commands: read + ack (update) its own commands. Never insert.
create policy device_select_own_commands on public.device_commands
  for select to authenticated
  using (device_id = public.current_device_id());

create policy device_ack_own_commands on public.device_commands
  for update to authenticated
  using (device_id = public.current_device_id())
  with check (device_id = public.current_device_id());

-- access_logs: insert its own scan logs
create policy device_insert_own_access_logs on public.access_logs
  for insert to authenticated
  with check (device_id = public.current_device_id());

-- device_logs: insert its own system logs
create policy device_insert_own_device_logs on public.device_logs
  for insert to authenticated
  with check (device_id = public.current_device_id());

-- device_health: upsert its own health row
create policy device_insert_own_health on public.device_health
  for insert to authenticated
  with check (device_id = public.current_device_id());

create policy device_update_own_health on public.device_health
  for update to authenticated
  using (device_id = public.current_device_id())
  with check (device_id = public.current_device_id());

-- device_uids: read its own UID list (used by SYNC flows)
create policy device_select_own_uids on public.device_uids
  for select to authenticated
  using (device_id = public.current_device_id());

-- ---------------------------------------------------------------------------
-- 6. ATTENDANCE VIEW
--    IST wall-clock. Scans counted between 06:00 and 24:00.
--    check_in  = earliest GRANTED scan of ANY of the employee's cards
--    check_out = latest   GRANTED scan of ANY of the employee's cards
-- ---------------------------------------------------------------------------

create or replace view public.attendance
with (security_invoker = on) as
with scans as (
  select
    du.employee_id,
    (al.logged_at at time zone 'Asia/Kolkata') as local_ts
  from public.access_logs al
  join public.device_uids du
    on du.uid = al.uid and du.device_id = al.device_id
  where al.event_type = 'GRANTED'
    and du.employee_id is not null
    and extract(hour from al.logged_at at time zone 'Asia/Kolkata') >= 6
)
select
  e.id                          as employee_id,
  e.name                        as employee_name,
  s.local_ts::date              as day,
  min(s.local_ts)               as check_in,
  max(s.local_ts)               as check_out,
  (min(s.local_ts)::time > time '10:00') as late,
  count(*)                      as scan_count
from scans s
join public.employees e on e.id = s.employee_id
group by e.id, e.name, s.local_ts::date;

-- ---------------------------------------------------------------------------
-- 7. REALTIME: publish device_commands inserts (push unlock to the ESP32)
-- ---------------------------------------------------------------------------

do $$
begin
  execute 'alter publication supabase_realtime add table public.device_commands';
exception when duplicate_object then
  raise notice 'device_commands already in supabase_realtime - skipped';
end $$;

-- ---------------------------------------------------------------------------
-- 8. HARDENING: anon gets nothing at the SQL-grant level either
--    (belt and braces on top of RLS)
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- NOTE on "Unused Index" linter items: harmless. Revisit after attendance has
-- run for a while (Dashboard -> Advisors) - some will start being used by the
-- attendance view; drop the rest then.
-- ============================================================================
