// Supabase Edge Function: zoho-attendance-sync
// Pushes unsynced RFID taps from access_logs into Zoho People.
// Invoked by pg_cron every 5 minutes (see zoho-integration.sql).
//
// Secrets required (supabase secrets set ...):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
//   ZOHO_ACCOUNTS_URL   e.g. https://accounts.zoho.in
//   ZOHO_PEOPLE_URL     e.g. https://people.zoho.in
// Provided automatically by Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ACCOUNTS_URL = Deno.env.get('ZOHO_ACCOUNTS_URL') ?? 'https://accounts.zoho.in'
const PEOPLE_URL = Deno.env.get('ZOHO_PEOPLE_URL') ?? 'https://people.zoho.in'
const CLIENT_ID = Deno.env.get('ZOHO_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!
const REFRESH_TOKEN = Deno.env.get('ZOHO_REFRESH_TOKEN')!

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// Zoho wants local wall-clock time. Office is IST.
const TZ = 'Asia/Kolkata'
const DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss'

function formatIST(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find(p => p.type === t)!.value
  // en-CA gives 24h with hour possibly "24" at midnight; normalise.
  const hh = g('hour') === '24' ? '00' : g('hour')
  return `${g('year')}-${g('month')}-${g('day')} ${hh}:${g('minute')}:${g('second')}`
}

/** Cached hourly access token; refreshed only when within 5 min of expiry. */
async function getAccessToken(): Promise<string> {
  const { data: cached } = await db
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .maybeSingle()

  if (cached && new Date(cached.expires_at).getTime() - Date.now() > 5 * 60_000) {
    return cached.access_token
  }

  const params = new URLSearchParams({
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  })

  const res = await fetch(`${ACCOUNTS_URL}/oauth/v2/token?${params}`, { method: 'POST' })
  const json = await res.json()

  if (!json.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(json)}`)
  }

  await db.from('zoho_tokens').upsert({
    id: 1,
    access_token: json.access_token,
    expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  })

  return json.access_token
}

Deno.serve(async () => {
  try {
    // Retire rows that will never be attendance (DENIED, REMOTE, ...)
    await db.rpc('zoho_mark_non_attendance')
    // Retire accidental double-swipes
    await db.rpc('zoho_mark_debounced', { p_debounce_seconds: 120 })

    const { data: pending, error } = await db.rpc('zoho_pending_attendance', {
      p_limit: 200,
      p_debounce_seconds: 120,
    })
    if (error) throw error

    if (!pending || pending.length === 0) {
      return Response.json({ ok: true, synced: 0, message: 'nothing pending' })
    }

    // Rows with no Zoho identity at all: park them with a clear reason
    // so an admin can map the UID and replay if they want.
    const unmapped = pending.filter(
      (r: any) => !r.zoho_emp_id && !r.email && !r.uid
    )
    const sendable = pending.filter((r: any) => r.zoho_emp_id || r.email || r.uid)

    if (unmapped.length) {
      await db.from('access_logs')
        .update({ zoho_synced_at: new Date().toISOString(), zoho_status: 'SKIPPED:unmapped' })
        .in('id', unmapped.map((r: any) => r.log_id))
    }

    if (sendable.length === 0) {
      return Response.json({ ok: true, synced: 0, skipped: unmapped.length })
    }

    // Build the bulkImport payload. Prefer empId, then emailId, then
    // mapId (Zoho's biometric/card-terminal identifier = the RFID UID).
    const entries = sendable.map((r: any) => {
      const who = r.zoho_emp_id
        ? { empId: r.zoho_emp_id }
        : r.email
          ? { emailId: r.email }
          : { mapId: r.uid }
      return { ...who, [r.direction]: formatIST(r.punched_at) }
    })

    const token = await getAccessToken()
    const body = new URLSearchParams({
      dateFormat: DATE_FORMAT,
      data: JSON.stringify(entries),
    })

    const res = await fetch(`${PEOPLE_URL}/people/api/attendance/bulkImport`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const text = await res.text()
    const now = new Date().toISOString()

    if (!res.ok) {
      // Leave zoho_synced_at NULL so the next run retries automatically.
      console.error('Zoho bulkImport failed', res.status, text)
      return Response.json(
        { ok: false, status: res.status, response: text.slice(0, 500) },
        { status: 502 }
      )
    }

    // Mark synced, recording which direction each tap became.
    for (const r of sendable) {
      await db.from('access_logs')
        .update({ zoho_synced_at: now, zoho_status: 'OK', zoho_direction: r.direction })
        .eq('id', r.log_id)
    }

    console.log(`Zoho sync: ${sendable.length} entries pushed`)
    return Response.json({
      ok: true,
      synced: sendable.length,
      skipped: unmapped.length,
      zoho: text.slice(0, 300),
    })
  } catch (err) {
    console.error('zoho-attendance-sync error:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})
