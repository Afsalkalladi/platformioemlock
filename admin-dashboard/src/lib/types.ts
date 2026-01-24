export type CommandStatus = 'PENDING' | 'DONE' | 'FAILED'

export type CommandType =
  | 'REMOTE_UNLOCK'
  | 'WHITELIST_ADD'
  | 'BLACKLIST_ADD'
  | 'REMOVE_UID'
  | 'SYNC_UIDS'
  | 'GET_PENDING'
  | 'SYNC_LOGS'

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
  name: string | null  // Human-readable name for the UID
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

export interface TaskInfo {
  name: string
  core: number
  stack_high_water: number
  stack_size: number
  priority: number
  is_running: boolean
}

export interface CoreStatus {
  core_id: number
  is_idle: boolean
  current_task: string
  free_stack_bytes: number
  cpu_usage_percent: number
}

export interface StorageInfo {
  littlefs_total_bytes: number
  littlefs_used_bytes: number
  littlefs_free_bytes: number
  nvs_used_entries: number
}

export interface DeviceHealth {
  device_id: string
  uptime_seconds: number
  free_heap_bytes: number
  total_heap_bytes: number | null
  min_free_heap_bytes: number | null
  largest_free_block_bytes: number | null
  wifi_rssi: number
  wifi_connected: boolean
  ntp_synced: boolean
  wifi_disconnect_count: number
  cpu_freq_mhz: number | null
  chip_model: number | null
  chip_revision: number | null
  chip_cores: number | null
  rfid_healthy: boolean
  rfid_version: number
  rfid_reinit_count: number
  rfid_soft_reset_count: number | null
  rfid_communication_ok: boolean | null
  rfid_antenna_on: boolean | null
  rfid_antenna_gain: number | null
  rfid_tx_control: number | null
  rfid_status1: number | null
  rfid_status2: number | null
  rfid_com_irq: number | null
  rfid_poll_count: number | null
  storage_littlefs_total_bytes: number | null
  storage_littlefs_used_bytes: number | null
  storage_littlefs_free_bytes: number | null
  storage_nvs_used_entries: number | null
  core0_id: number | null
  core0_is_idle: boolean | null
  core0_current_task: string | null
  core0_free_stack_bytes: number | null
  core0_cpu_usage_percent: number | null
  core1_id: number | null
  core1_is_idle: boolean | null
  core1_current_task: string | null
  core1_free_stack_bytes: number | null
  core1_cpu_usage_percent: number | null
  watchdog_enabled: boolean | null
  watchdog_timeout_ms: number | null
  tasks: TaskInfo[] | null
  task_count: number | null
  last_rfid_error: string | null
  last_rfid_error_time: string | null
  last_successful_read_time: string | null
  updated_at: string
}
