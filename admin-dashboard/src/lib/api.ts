import { supabase } from './supabase'
import type { Command, DeviceSummary, DeviceDetail, DeviceUID, PendingUID, CommandType, AccessLog, DeviceHealth } from './types'

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
  // Use device_health.updated_at as the primary "last seen" indicator
  // because it's pushed every 60s while the device is alive.
  // Fall back to the most recent device_command created_at.
  const [healthRes, cmdRes] = await Promise.all([
    supabase
      .from('device_health')
      .select('updated_at')
      .eq('device_id', deviceId)
      .single(),
    supabase
      .from('device_commands')
      .select('status, created_at')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false }),
  ])

  const cmds = cmdRes.data
  const healthRow = healthRes.data

  if ((!cmds || cmds.length === 0) && !healthRow) return null

  const pending = cmds ? cmds.filter(c => c.status === 'PENDING').length : 0
  const completed = cmds ? cmds.filter(c => c.status === 'DONE').length : 0

  // Pick the most recent timestamp between health heartbeat and latest command
  const cmdTs = cmds && cmds.length > 0 ? cmds[0].created_at : null
  const healthTs = healthRow ? healthRow.updated_at : null
  let lastSeen = cmdTs || ''
  if (healthTs && (!cmdTs || new Date(healthTs) > new Date(cmdTs))) {
    lastSeen = healthTs
  }

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

  // Normalise UID to uppercase – RFID reader emits uppercase hex (%02X)
  // and NVS keys are case-sensitive, so every UID must match that format.
  if (uid) insertData.uid = uid.toUpperCase()
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
    whitelist: whitelist.map(u => u.toUpperCase()),
    blacklist: blacklist.map(u => u.toUpperCase()),
  })
}

// Query #11: Get pending
export async function sendGetPending(deviceId: string): Promise<Command> {
  return sendCommand(deviceId, 'GET_PENDING')
}

// Query #12: Sync logs
export async function sendSyncLogs(deviceId: string): Promise<Command> {
  return sendCommand(deviceId, 'SYNC_LOGS')
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

// Query #15: Update UID name
export async function updateUIDName(uidId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('device_uids')
    .update({ name: name || null })
    .eq('id', uidId)

  if (error) throw error
}

// Query #16: Get UID name mapping for a device
export async function fetchUIDNames(deviceId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('device_uids')
    .select('uid, name')
    .eq('device_id', deviceId)
    .not('name', 'is', null)

  if (error) throw error

  const mapping: Record<string, string> = {}
  if (data) {
    data.forEach((item: { uid: string; name: string | null }) => {
      if (item.name) mapping[item.uid] = item.name
    })
  }
  return mapping
}

// Query #17: Fetch device health
export async function fetchDeviceHealth(deviceId: string): Promise<DeviceHealth | null> {
  const { data, error } = await supabase
    .from('device_health')
    .select('*')
    .eq('device_id', deviceId)
    .single()

  if (error) {
    // No health data yet or table doesn't exist
    if (error.code === 'PGRST116' || error.code === '42P01') return null
    throw error
  }
  return data as DeviceHealth
}

// Query #18: Fetch health timestamps for all devices (used for online/offline indicator)
export async function fetchAllDeviceHealthTimestamps(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('device_health')
    .select('device_id, updated_at')

  if (error) return {}
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.device_id] = row.updated_at
  }
  return map
}
