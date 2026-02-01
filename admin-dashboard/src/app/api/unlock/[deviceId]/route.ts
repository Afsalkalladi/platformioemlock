import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Simple token-based auth for quick unlock (optional security layer)
// Set QUICK_UNLOCK_TOKEN in your environment variables
const QUICK_UNLOCK_TOKEN = process.env.QUICK_UNLOCK_TOKEN

interface RouteParams {
  params: Promise<{ deviceId: string }>
}

// CORS headers for iOS Shortcuts compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Ensure device exists in devices table
async function ensureDeviceExists(deviceId: string): Promise<void> {
  const { error } = await supabase
    .from('devices')
    .insert({ device_id: deviceId })
    .select()
    .single()

  // Ignore duplicate key errors (device already exists)
  if (error && !error.message.includes('duplicate')) {
    throw error
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params
    
    // Check if client wants plain text response (for iOS Shortcuts)
    const wantsText = request.nextUrl.searchParams.get('format') === 'text' ||
                      request.headers.get('accept')?.includes('text/plain')
    
    // Optional: Verify token if set
    if (QUICK_UNLOCK_TOKEN) {
      const authHeader = request.headers.get('authorization')
      const token = authHeader?.replace('Bearer ', '') || 
                    request.nextUrl.searchParams.get('token')
      
      if (token !== QUICK_UNLOCK_TOKEN) {
        if (wantsText) {
          return new NextResponse('ERROR: Unauthorized', { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
          })
        }
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401, headers: corsHeaders }
        )
      }
    }

    if (!deviceId) {
      if (wantsText) {
        return new NextResponse('ERROR: Device ID required', { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
        })
      }
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Ensure device exists first (required by foreign key)
    await ensureDeviceExists(deviceId)

    // Insert REMOTE_UNLOCK command
    const { data, error } = await supabase
      .from('device_commands')
      .insert({
        device_id: deviceId,
        type: 'REMOTE_UNLOCK',
        status: 'PENDING',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      if (wantsText) {
        return new NextResponse('ERROR: ' + error.message, { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
        })
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: corsHeaders }
      )
    }

    // Return plain text for iOS Shortcuts compatibility
    if (wantsText) {
      return new NextResponse('OK: Door unlock command sent', { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Unlock command sent',
      command_id: data.id,
      device_id: deviceId,
    }, { headers: corsHeaders })
  } catch (err) {
    console.error('Unlock API error:', err)
    
    const wantsText = request.nextUrl.searchParams.get('format') === 'text'
    if (wantsText) {
      return new NextResponse('ERROR: Internal server error', { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Also support GET for simple shortcuts (iOS Shortcuts, etc.)
export async function GET(request: NextRequest, { params }: RouteParams) {
  return POST(request, { params })
}
