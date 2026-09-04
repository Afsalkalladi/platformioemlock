# Zoho People Integration — Setup

## What it does

RFID tap at the door → `access_logs` (already working) → a Supabase Edge Function
on a 5-minute cron → Zoho People **Attendance Bulk Import**.

First tap of the IST day = check-in, next = check-out, alternating. Repeat taps
within 2 minutes are treated as accidental double-swipes and dropped.

**The ESP32 is not involved.** Zoho's bulk import allows only 10 requests with a
5-minute lock period, OAuth tokens must be refreshed hourly, and your firmware
already buffers logs offline — so batching server-side is both safer and more
robust than calling Zoho from the device.

---

## Step 1 — Zoho self-client credentials

1. Go to https://api-console.zoho.in → **Add Client** → **Self Client**
   (use `.in` if your Zoho account is on the India data centre — check the
   domain you log in to Zoho People with; use `.com` for US, `.eu` for EU)
2. Copy the **Client ID** and **Client Secret**
3. **Generate Code** tab → scope:
   ```
   ZOHOPEOPLE.attendance.ALL,ZOHOPEOPLE.forms.READ
   ```
   Duration 10 minutes → pick your portal → **Create** → copy the code
4. Exchange the code for a refresh token **within 10 minutes**:
   ```bash
   curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=THE_CODE"
   ```
   Save `refresh_token` from the response — it does not expire.

## Step 2 — Database

Supabase SQL Editor → run `supabase/zoho-integration.sql`.

## Step 3 — Deploy the Edge Function

```bash
supabase functions deploy zoho-attendance-sync

supabase secrets set \
  ZOHO_CLIENT_ID=... \
  ZOHO_CLIENT_SECRET=... \
  ZOHO_REFRESH_TOKEN=... \
  ZOHO_ACCOUNTS_URL=https://accounts.zoho.in \
  ZOHO_PEOPLE_URL=https://people.zoho.in
```

Test it once manually before scheduling:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/zoho-attendance-sync" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```
Expect `{"ok":true,"synced":N,...}`. Logs: Supabase Dashboard → Edge Functions → Logs.

## Step 4 — Schedule it

Uncomment and edit the `cron.schedule(...)` block at the bottom of
`zoho-integration.sql` (fill in `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`), then run it.

## Step 5 — Map cards to employees

Two options — pick either:

**A. In Zoho (no mapping table needed).** Set each employee's **Mapper ID**
in Zoho People to their RFID UID. Mapper ID is Zoho's built-in field for
biometric/card terminal identifiers. The sync falls back to `mapId = UID`
whenever no local mapping exists.

**B. In the dashboard.** Open `/zoho`. It lists whitelisted cards with no
mapping; click a UID to prefill, then add the Zoho Employee ID (or email) and
name. This also gives you names in the sync log, so it's worth doing even if
you use option A.

---

## Verifying

- `/zoho` page → **Recent attendance sync** shows direction and status per tap
- Zoho People → Attendance → the entries appear under each employee
- Cron history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

## Status values on `access_logs.zoho_status`

| Value | Meaning |
|---|---|
| `OK` | pushed to Zoho |
| `SKIPPED:not-attendance` | DENIED / PENDING / REMOTE event — never attendance |
| `SKIPPED:debounce` | repeat tap within 2 minutes |
| `SKIPPED:unmapped` | no Zoho identity could be determined |
| `null` | not yet processed (or last attempt failed — it retries automatically) |

## Things to decide

- **Remote widget unlocks are excluded from attendance** by design — there's no
  cardholder, and `requested_by` is a token label, not a Zoho employee. If you
  want those counted, map token labels to employees and extend
  `zoho_pending_attendance` to include `event_type = 'REMOTE'`.
- **Single reader means direction is inferred, not measured.** If someone taps to
  leave for lunch and taps again coming back, that's a check-out and check-in —
  correct. But if someone holds the door for a colleague who never taps, that
  person's day never opens. A second reader on the exit side, or Zoho's
  regularisation flow for corrections, are the two ways out of this.
- **Debounce window** is 2 minutes; change `p_debounce_seconds` in the Edge
  Function call if your door gets more repeat traffic.
- **Timezone is hardcoded to `Asia/Kolkata`** in both the SQL and the function.
