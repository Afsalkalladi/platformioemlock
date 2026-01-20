import { supabase } from './supabase'
import type { Command, DeviceSummary, DeviceDetail, DeviceUID, PendingUID, CommandType } from './types'

// Query #1: List all devices (using device_overview view)
export async function fetchDevices(): Promise<DeviceSummary[]> {
  const { data, error } = await supabase
    .from('device_overview')
    .select('*')
    .order('device_id', { ascending: true })
  
  if (error) throw error
  return data as DeviceSummary[]
}

// Query #2: Device summary
export async function fetchDeviceDetail(deviceId: string): Promise<DeviceDetail | null> {
  const { data, error } = await supabase
    .from('device_commands')
    .select('status, created_at')
    .eq('device_id', deviceId)
  
  if (error) throw error
  if (!data || data.length === 0) return null
  
  const pending = data.filter(c => c.status === 'PENDING').length
  const completed = data.filter(c => c.status === 'DONE').length
  const lastSeen = data[0].created_at
  
  return {
    device_id: deviceId,
    pending_commands: pending,
    completed_commands: completed,
    last_seen: lastSeen,
  }
}

// Query #3: Fetch whitelisted UIDs
export async function fetchWhitelistUIDs(deviceId: string): Promise<DeviceUID[]> {
  const { data, error } = await supabase
    .from('device_uids')
    .select('*')
    .eq('device_id', deviceId)
    .eq('state', 'WHITELIST')
    .order('updated_at', { ascending: false })
  
  if (error) throw error
  return data as DeviceUID[]
}

// Query #4: Fetch blacklisted UIDs
export async function fetchBlacklistUIDs(deviceId: string): Promise<DeviceUID[]> {
  const { data, error } = await supabase
    .from('device_uids')
    .select('*')
    .eq('device_id', deviceId)
    .eq('state', 'BLACKLIST')
    .order('updated_at', { ascending: false })
  
  if (error) throw error
  return data as DeviceUID[]
}

// Query #5: Fetch pending UIDs (from last GET_PENDING command result)
export async function fetchPendingUIDs(deviceId: string): Promise<PendingUID[]> {
  // Get the most recent successful GET_PENDING command
  const { data, error } = await supabase
    .from('device_commands')
    .select('result, acked_at')
    .eq('device_id', deviceId)
    .eq('type', 'GET_PENDING')
    .eq('status', 'DONE')
    .not('result', 'is', null)
    .order('acked_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return [] // No results
    throw error
  }
  
  if (!data || !data.result) return []
  
  try {
    const uids = JSON.parse(data.result)
    // Convert array of UIDs to array of objects with reported_at
    return uids.map((uid: string) => ({
      uid,
      reported_at: data.acked_at || new Date().toISOString()
    }))
  } catch (e) {
    console.error('Failed to parse pending UIDs:', e)
    return []
  }
}

// Query #12: Command history
export async function fetchCommandHistory(deviceId: string, limit = 50): Promise<Command[]> {
  const { data, error } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) throw error
  return data as Command[]
}

// Query #13: Poll command status
export async function fetchCommandStatus(commandId: string): Promise<Command | null> {
  const { data, error } = await supabase
    .from('device_commands')
    .select('*')
    .eq('id', commandId)
    .single()
  
  if (error) throw error
  return data as Command
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

// Command insertion helpers
export async function sendCommand(
  deviceId: string,
  type: CommandType,
  uid?: string,
  payload?: any
): Promise<Command> {
  // Ensure device exists first (required by foreign key)
  await ensureDeviceExists(deviceId)
  
  const insertData: any = {
    device_id: deviceId,
    type,
    status: 'PENDING',
  }
  
  if (uid) insertData.uid = uid
  if (payload) insertData.payload = payload
  
  const { data, error } = await supabase
    .from('device_commands')
    .insert(insertData)
    .select()
    .single()
  
  if (error) throw error
  return data as Command
}

// Query #6: Remote unlock
export async function sendRemoteUnlock(deviceId: string): Promise<Command> {
  return sendCommand(deviceId, 'REMOTE_UNLOCK')
}

// Query #7: Whitelist UID
export async function sendWhitelistAdd(deviceId: string, uid: string): Promise<Command> {
  return sendCommand(deviceId, 'WHITELIST_ADD', uid)
}

// Query #8: Blacklist UID
export async function sendBlacklistAdd(deviceId: string, uid: string): Promise<Command> {
  return sendCommand(deviceId, 'BLACKLIST_ADD', uid)
}

// Query #9: Remove UID
export async function sendRemoveUID(deviceId: string, uid: string): Promise<Command> {
  return sendCommand(deviceId, 'REMOVE_UID', uid)
}

// Query #10: Sync UIDs
export async function sendSyncUIDs(
  deviceId: string,
  whitelist: string[],
  blacklist: string[]
): Promise<Command> {
  return sendCommand(deviceId, 'SYNC_UIDS', undefined, {
    whitelist,
    blacklist,
  })
}

// Query #11: Get pending
export async function sendGetPending(deviceId: string): Promise<Command> {
  return sendCommand(deviceId, 'GET_PENDING')
}

// Query #14: Fetch access logs
export async function fetchAccessLogs(deviceId: string, limit = 100): Promise<AccessLog[]> {
  const { data, error } = await supabase
    .from('access_logs')
    .select('*')
    .eq('device_id', deviceId)
    .order('logged_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    // If table doesn't exist yet, return empty array
    if (error.code === '42P01') return []
    throw error
  }
  return data as AccessLog[]
}
