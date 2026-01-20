export type CommandStatus = 'PENDING' | 'DONE' | 'FAILED'

export type CommandType =
  | 'REMOTE_UNLOCK'
  | 'WHITELIST_ADD'
  | 'BLACKLIST_ADD'
  | 'REMOVE_UID'
  | 'SYNC_UIDS'
  | 'GET_PENDING'

export type UIDState = 'WHITELIST' | 'BLACKLIST'

export interface Command {
  id: string
  device_id: string
  type: CommandType
  uid: string | null
  payload: any | null
  status: CommandStatus
  result: string | null
  created_at: string
  acked_at: string | null
}

export interface DeviceUID {
  id: string
  device_id: string
  uid: string
  state: UIDState
  updated_at: string
}

export interface PendingUID {
  uid: string
  reported_at: string
}

export interface DeviceSummary {
  device_id: string
  last_command_at: string
  pending_commands: number
}

export interface DeviceDetail {
  device_id: string
  pending_commands: number
  completed_commands: number
  last_seen: string
}

export interface AccessLog {
  id: string
  device_id: string
  uid: string
  event_type: 'GRANTED' | 'DENIED' | 'PENDING' | 'REMOTE'
  logged_at: string
}
