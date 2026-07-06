import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// This route runs server-side on Vercel and uses the SERVICE ROLE key only.
// It is the ONLY way to unlock without an admin session, and it requires a
// valid unlock key issued from the admin dashboard (Unlock Keys page).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

interface RouteParams {
  params: Promise<{ deviceId: string }>
}

// CORS headers for iOS Shortcuts / Android widget compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function textOrJson(
  wantsText: boolean,
  status: number,
  text: string,
  json: Record<string, unknown>
) {
  if (wantsText) {
    return new NextResponse(text, {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.json(json, { status, headers: corsHeaders })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const wantsText =
    request.nextUrl.searchParams.get('format') === 'text' ||
    (request.headers.get('accept') ?? '').includes('text/plain')

  try {
    const { deviceId } = await params

    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set')
      return textOrJson(wantsText, 500, 'ERROR: Server misconfigured', {
        success: false,
        error: 'Server misconfigured',
      })
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    if (!deviceId) {
      return textOrJson(wantsText, 400, 'ERROR: Device ID required', {
        success: false,
        error: 'Device ID required',
      })
    }

    // ---- REQUIRED: unlock key (from admin dashboard -> Unlock Keys) ----
    const authHeader = request.headers.get('authorization')
    const rawKey =
      authHeader?.replace(/^Bearer\s+/i, '') ||
      request.nextUrl.searchParams.get('key') ||
      ''

    if (!rawKey) {
      return textOrJson(wantsText, 401, 'ERROR: Unlock key required', {
        success: false,
        error: 'Unlock key required. Ask the admin for a key and add it to your widget.',
      })
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const { data: keyRow, error: keyErr } = await supabase
      .from('unlock_keys')
      .select('id, label, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyErr) {
      console.error('Key lookup error:', keyErr)
      return textOrJson(wantsText, 500, 'ERROR: Key lookup failed', {
        success: false,
        error: 'Key lookup failed',
      })
    }

    if (!keyRow || keyRow.revoked_at) {
      return textOrJson(wantsText, 401, 'ERROR: Invalid or revoked key', {
        success: false,
        error: 'Invalid or revoked unlock key',
      })
    }

    // ---- Insert the unlock command, recording WHO did it ----
    const { data, error } = await supabase
      .from('device_commands')
      .insert({
        device_id: deviceId,
        type: 'REMOTE_UNLOCK',
        status: 'PENDING',
        issued_by: keyRow.label,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return textOrJson(wantsText, 500, 'ERROR: ' + error.message, {
        success: false,
        error: error.message,
      })
    }

    // Track key usage (best effort)
    await supabase
      .from('unlock_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id)

    return textOrJson(wantsText, 200, 'OK: Door unlock command sent', {
      success: true,
      message: 'Unlock command sent',
      command_id: data.id,
      device_id: deviceId,
      unlocked_by: keyRow.label,
    })
  } catch (err) {
    console.error('Unlock API error:', err)
    return textOrJson(wantsText, 500, 'ERROR: Internal server error', {
      success: false,
      error: 'Internal server error',
    })
  }
}

// Keep GET support for simple shortcut setups (key goes in ?key=...)
export async function GET(request: NextRequest, { params }: RouteParams) {
  return POST(request, { params })
}
