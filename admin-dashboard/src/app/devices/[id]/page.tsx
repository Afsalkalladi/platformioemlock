'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import CommandButton from '@/components/CommandButton'
import {
  fetchDeviceDetail,
  fetchWhitelistUIDs,
  fetchBlacklistUIDs,
  fetchPendingUIDs,
  fetchCommandHistory,
  fetchAccessLogs,
  fetchUIDNames,
  fetchDeviceHealth,
  sendRemoteUnlock,
  sendGetPending,
  sendSyncUIDs,
  sendSyncLogs,
  sendWhitelistAdd,
  sendBlacklistAdd,
  sendRemoveUID,
  updateUIDName,
} from '@/lib/api'
import type { DeviceDetail, DeviceUID, PendingUID, Command, AccessLog, DeviceHealth } from '@/lib/types'


type Tab = 'pending' | 'whitelist' | 'blacklist' | 'commands' | 'logs' | 'health'

export default function DeviceDetailPage() {
  const params = useParams()
  const deviceId = params.id as string

  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [detail, setDetail] = useState<DeviceDetail | null>(null)
  const [pending, setPending] = useState<PendingUID[]>([])
  const [whitelist, setWhitelist] = useState<DeviceUID[]>([])
  const [blacklist, setBlacklist] = useState<DeviceUID[]>([])
  const [commands, setCommands] = useState<Command[]>([])
  const [logs, setLogs] = useState<AccessLog[]>([])
  const [health, setHealth] = useState<DeviceHealth | null>(null)
  const [uidNames, setUidNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 5000)
    return () => clearInterval(interval)
  }, [deviceId])

  async function loadAll() {
    try {
      const [detailData, pendingData, whitelistData, blacklistData, commandsData, logsData, namesData, healthData] =
        await Promise.all([
          fetchDeviceDetail(deviceId),
          fetchPendingUIDs(deviceId),
          fetchWhitelistUIDs(deviceId),
          fetchBlacklistUIDs(deviceId),
          fetchCommandHistory(deviceId),
          fetchAccessLogs(deviceId),
          fetchUIDNames(deviceId),
          fetchDeviceHealth(deviceId),
        ])

      setDetail(detailData)
      setPending(pendingData)
      setWhitelist(whitelistData)
      setBlacklist(blacklistData)
      setCommands(commandsData)
      setLogs(logsData)
      setHealth(healthData)
      setUidNames(namesData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load device data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading device...</div>
      </div>
    )
  }

  const lastSeen = detail ? new Date(detail.last_seen) : null
  const isOnline = lastSeen ? Date.now() - lastSeen.getTime() < 10000 : false

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/devices" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
            ← Back to devices
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-mono">{deviceId}</h1>
              {lastSeen && (
                <p className="text-gray-600 mt-1">
                  Last seen: {lastSeen.toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}
              >
                {isOnline ? '● Online' : '○ Offline'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex gap-3 flex-wrap">
            <CommandButton
              label="Remote Unlock"
              onClick={() => sendRemoteUnlock(deviceId)}
              onComplete={loadAll}
              variant="primary"
            />
            <CommandButton
              label="Fetch Pending"
              onClick={() => sendGetPending(deviceId)}
              onComplete={loadAll}
              variant="secondary"
            />
            <CommandButton
              label="Sync UIDs"
              onClick={() =>
                sendSyncUIDs(
                  deviceId,
                  whitelist.map((u) => u.uid),
                  blacklist.map((u) => u.uid)
                )
              }
              onComplete={loadAll}
              variant="danger"
            />
            <CommandButton
              label="Sync Logs"
              onClick={() => sendSyncLogs(deviceId)}
              onComplete={loadAll}
              variant="secondary"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['pending', 'whitelist', 'blacklist', 'logs', 'commands', 'health'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm capitalize
                  ${activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab}
                {tab === 'pending' && pending.length > 0 && (
                  <span className="ml-2 bg-yellow-100 text-yellow-800 py-0.5 px-2 rounded-full text-xs">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow">
          {activeTab === 'pending' && (
            <PendingTab
              pending={pending}
              deviceId={deviceId}
              onAction={loadAll}
            />
          )}
          {activeTab === 'whitelist' && (
            <UIDListTab
              uids={whitelist}
              deviceId={deviceId}
              type="whitelist"
              onAction={loadAll}
            />
          )}
          {activeTab === 'blacklist' && (
            <UIDListTab
              uids={blacklist}
              deviceId={deviceId}
              type="blacklist"
              onAction={loadAll}
            />
          )}
          {activeTab === 'logs' && <LogsTab logs={logs} uidNames={uidNames} />}
          {activeTab === 'commands' && <CommandsTab commands={commands} />}
          {activeTab === 'health' && <HealthTab health={health} />}
        </div>
      </div>
    </div>
  )
}

function PendingTab({
  pending,
  deviceId,
  onAction,
}: {
  pending: PendingUID[]
  deviceId: string
  onAction: () => void
}) {
  if (pending.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No pending UIDs. Unknown cards will appear here after scanning.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              UID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              First Seen
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {pending.map((item) => (
            <tr key={item.uid}>
              <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                {item.uid}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(item.reported_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                <CommandButton
                  label="Whitelist"
                  onClick={() => sendWhitelistAdd(deviceId, item.uid)}
                  onComplete={onAction}
                  variant="primary"
                  className="text-xs px-3 py-1"
                />
                <CommandButton
                  label="Blacklist"
                  onClick={() => sendBlacklistAdd(deviceId, item.uid)}
                  onComplete={onAction}
                  variant="danger"
                  className="text-xs px-3 py-1"
                />
                <CommandButton
                  label="Remove"
                  onClick={() => sendRemoveUID(deviceId, item.uid)}
                  onComplete={onAction}
                  variant="secondary"
                  className="text-xs px-3 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UIDListTab({
  uids,
  deviceId,
  type,
  onAction,
}: {
  uids: DeviceUID[]
  deviceId: string
  type: 'whitelist' | 'blacklist'
  onAction: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleSaveName = async (id: string) => {
    try {
      await updateUIDName(id, editName)
      setEditingId(null)
      onAction()
    } catch (err) {
      console.error('Failed to update name:', err)
    }
  }

  if (uids.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No {type} entries yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              UID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Last Updated
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {uids.map((item) => (
            <tr key={item.id}>
              <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                {item.uid}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-32"
                      placeholder="Enter name"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveName(item.id)}
                      className="text-green-600 hover:text-green-800 text-xs"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:text-gray-700 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={item.name ? 'text-blue-600 font-medium' : 'text-gray-400 italic'}>
                      {item.name || 'No name'}
                    </span>
                    <button
                      onClick={() => {
                        setEditingId(item.id)
                        setEditName(item.name || '')
                      }}
                      className="text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(item.updated_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                <CommandButton
                  label="Remove"
                  onClick={() => sendRemoveUID(deviceId, item.uid)}
                  onComplete={onAction}
                  variant="danger"
                  className="text-xs px-3 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LogsTab({ logs, uidNames }: { logs: AccessLog[]; uidNames: Record<string, string> }) {
  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No access logs yet. Logs will appear when cards are scanned.
      </div>
    )
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'GRANTED':
        return 'bg-green-100 text-green-800'
      case 'DENIED':
        return 'bg-red-100 text-red-800'
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800'
      case 'REMOTE':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              UID / Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Event
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(log.logged_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className="font-mono">{log.uid}</span>
                {uidNames[log.uid] && (
                  <span className="ml-2 text-blue-600 font-medium">
                    ({uidNames[log.uid]})
                  </span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getEventColor(log.event_type)}`}
                >
                  {log.event_type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CommandsTab({ commands }: { commands: Command[] }) {
  if (commands.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No command history yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              UID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Result
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {commands.map((cmd) => (
            <tr key={cmd.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(cmd.created_at).toLocaleTimeString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {cmd.type}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                {cmd.uid || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${cmd.status === 'DONE'
                    ? 'bg-green-100 text-green-800'
                    : cmd.status === 'FAILED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                    }`}
                >
                  {cmd.status}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {cmd.result || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HealthTab({ health }: { health: DeviceHealth | null }) {
  if (!health) {
    return (
      <div className="p-8 text-center text-gray-500">
        No health data yet. Health data will appear once the device starts reporting.
      </div>
    )
  }

  // ---- helpers ----
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }

  const formatPercent = (value: number | null) => {
    if (value === null) return 'N/A'
    return `${value.toFixed(1)}%`
  }

  const getRfidChipName = (ic: number | null) => {
    if (ic === null || ic === undefined) return 'N/A'
    if (ic === 0x32) return 'PN532'
    if (ic === 0x00) return 'No Communication'
    return `Unknown (0x${ic.toString(16).toUpperCase()})`
  }

  const getChipModelName = (model: number | null) => {
    if (model === null) return 'N/A'
    switch (model) {
      case 0: return 'ESP32'
      case 2: return 'ESP32-S2'
      case 9: return 'ESP32-C3'
      case 5: return 'ESP32-S3'
      default: return `Model ${model}`
    }
  }

  const getSignalQuality = (rssi: number) => {
    if (rssi >= -50) return { label: 'Excellent', color: 'text-green-700' }
    if (rssi >= -60) return { label: 'Good', color: 'text-green-600' }
    if (rssi >= -70) return { label: 'Fair', color: 'text-yellow-600' }
    return { label: 'Weak', color: 'text-red-600' }
  }

  const lastUpdate = new Date(health.updated_at)
  const isStale = Date.now() - lastUpdate.getTime() > 120000

  const heapUsed = health.total_heap_bytes && health.free_heap_bytes
    ? health.total_heap_bytes - health.free_heap_bytes
    : null
  const heapUsagePercent = health.total_heap_bytes && heapUsed
    ? (heapUsed / health.total_heap_bytes) * 100
    : null

  const littlefsUsagePercent = health.storage_littlefs_total_bytes && health.storage_littlefs_used_bytes
    ? (health.storage_littlefs_used_bytes / health.storage_littlefs_total_bytes) * 100
    : null

  const signal = getSignalQuality(health.wifi_rssi)

  return (
    <div className="p-6 space-y-6">
      {/* Stale Banner */}
      {isStale && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded">
          ⚠️ Health data is stale (last update: {lastUpdate.toLocaleString()})
        </div>
      )}

      {/* ============ TOP ROW: 4 summary cards ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* -- PN532 RFID Reader -- */}
        <div className={`rounded-lg p-4 border ${health.rfid_healthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h3 className={`text-sm font-semibold mb-2 ${health.rfid_healthy ? 'text-green-800' : 'text-red-800'}`}>
            RFID Reader (PN532)
          </h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>Status:</span>
              <span className={`font-medium ${health.rfid_healthy ? 'text-green-700' : 'text-red-700'}`}>
                {health.rfid_healthy ? '✓ Healthy' : '✗ Error'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>Chip:</span>
              <span className="font-medium">{getRfidChipName(health.rfid_ic)}</span>
            </div>
            <div className="flex justify-between">
              <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>SPI Comms:</span>
              <span className={`font-medium ${health.rfid_communication_ok ? 'text-green-700' : 'text-red-700'}`}>
                {health.rfid_communication_ok ? '✓ OK' : '✗ Failed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>SAM Config:</span>
              <span className={`font-medium ${health.rfid_sam_configured ? 'text-green-700' : 'text-red-700'}`}>
                {health.rfid_sam_configured ? '✓ OK' : '✗ Fail'}
              </span>
            </div>
            {health.rfid_firmware_major !== null && health.rfid_firmware_minor !== null && (
              <div className="flex justify-between">
                <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>Firmware:</span>
                <span className="font-medium">{health.rfid_firmware_major}.{health.rfid_firmware_minor}</span>
              </div>
            )}
            {health.rfid_firmware_support !== null && (
              <div className="flex justify-between">
                <span className={health.rfid_healthy ? 'text-green-600' : 'text-red-600'}>Features:</span>
                <span className="font-medium font-mono">0x{health.rfid_firmware_support.toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
            )}
          </div>
        </div>

        {/* -- WiFi -- */}
        <div className={`rounded-lg p-4 border ${health.wifi_connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h3 className={`text-sm font-semibold mb-2 ${health.wifi_connected ? 'text-green-800' : 'text-red-800'}`}>WiFi</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className={health.wifi_connected ? 'text-green-600' : 'text-red-600'}>Status:</span>
              <span className={`font-medium ${health.wifi_connected ? 'text-green-700' : 'text-red-700'}`}>
                {health.wifi_connected ? '✓ Connected' : '✗ Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={health.wifi_connected ? 'text-green-600' : 'text-red-600'}>Signal:</span>
              <span className={`font-medium ${signal.color}`}>{health.wifi_rssi} dBm ({signal.label})</span>
            </div>
            <div className="flex justify-between">
              <span className={health.wifi_connected ? 'text-green-600' : 'text-red-600'}>NTP Sync:</span>
              <span className={`font-medium ${health.ntp_synced ? 'text-green-700' : 'text-yellow-600'}`}>
                {health.ntp_synced ? '✓ Synced' : '⏳ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={health.wifi_connected ? 'text-green-600' : 'text-red-600'}>Disconnects:</span>
              <span className="font-medium">{health.wifi_disconnect_count}</span>
            </div>
          </div>
        </div>

        {/* -- Memory -- */}
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <h3 className="text-sm font-semibold mb-2 text-green-800">Memory (Heap)</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-green-600">Total:</span>
              <span className="font-medium">{formatBytes(health.total_heap_bytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">Free:</span>
              <span className="font-medium">{formatBytes(health.free_heap_bytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">Used:</span>
              <span className="font-medium">{formatBytes(heapUsed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">Usage:</span>
              <span className="font-medium">{formatPercent(heapUsagePercent)}</span>
            </div>
            {health.min_free_heap_bytes != null && (
              <div className="flex justify-between">
                <span className="text-green-600">Min Free:</span>
                <span className="font-medium">{formatBytes(health.min_free_heap_bytes)}</span>
              </div>
            )}
          </div>
          {heapUsagePercent !== null && (
            <div className="mt-2">
              <div className="w-full bg-green-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${heapUsagePercent > 80 ? 'bg-red-500' : heapUsagePercent > 60 ? 'bg-yellow-500' : 'bg-green-600'}`}
                  style={{ width: `${Math.min(heapUsagePercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* -- Processor -- */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-semibold mb-2 text-blue-800">Processor</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-blue-600">Model:</span>
              <span className="font-medium">{getChipModelName(health.chip_model)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Cores:</span>
              <span className="font-medium">{health.chip_cores ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Frequency:</span>
              <span className="font-medium">{health.cpu_freq_mhz ?? 'N/A'} MHz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Revision:</span>
              <span className="font-medium">{health.chip_revision ?? 'N/A'}</span>
            </div>
            {health.firmware_version && (
              <div className="flex justify-between">
                <span className="text-blue-600">Firmware:</span>
                <span className="font-medium font-mono">{health.firmware_version}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ PN532 DETAILED HEALTH ============ */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3 text-indigo-800">PN532 Reader Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-indigo-600">IC Code:</span>
              <span className="font-medium font-mono">
                {health.rfid_ic !== null ? `0x${health.rfid_ic.toString(16).toUpperCase().padStart(2, '0')}` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-600">Firmware:</span>
              <span className="font-medium">
                {health.rfid_firmware_major !== null && health.rfid_firmware_minor !== null
                  ? `${health.rfid_firmware_major}.${health.rfid_firmware_minor}`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-600">Support Flags:</span>
              <span className="font-medium font-mono">
                {health.rfid_firmware_support !== null
                  ? `0x${health.rfid_firmware_support.toString(16).toUpperCase().padStart(2, '0')}`
                  : 'N/A'}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-indigo-600">SPI Communication:</span>
              <span className={`font-medium ${health.rfid_communication_ok ? 'text-green-600' : 'text-red-600'}`}>
                {health.rfid_communication_ok ? '✓ OK' : '✗ Failed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-600">SAM Configuration:</span>
              <span className={`font-medium ${health.rfid_sam_configured ? 'text-green-600' : 'text-red-600'}`}>
                {health.rfid_sam_configured ? '✓ Configured' : '✗ Not Configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-600">Overall Health:</span>
              <span className={`font-medium ${health.rfid_healthy ? 'text-green-600' : 'text-red-600'}`}>
                {health.rfid_healthy ? '✓ Healthy' : '✗ Unhealthy'}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-indigo-600">Total Polls:</span>
              <span className="font-medium">{health.rfid_poll_count?.toLocaleString() ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-indigo-600">Reader Reinits:</span>
              <span className={`font-medium ${health.rfid_reinit_count > 3 ? 'text-red-600' : ''}`}>
                {health.rfid_reinit_count}
              </span>
            </div>
            {health.last_successful_read_time && (
              <div className="flex justify-between">
                <span className="text-indigo-600">Last Read:</span>
                <span className="font-medium text-xs">{new Date(health.last_successful_read_time).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ RFID ERROR (if any) ============ */}
      {health.last_rfid_error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2 text-red-800">Last RFID Error</h3>
          <p className="text-red-700 font-medium text-sm">{health.last_rfid_error}</p>
          {health.last_rfid_error_time && (
            <p className="text-red-600 text-xs mt-1">
              at {new Date(health.last_rfid_error_time).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* ============ DUAL-CORE STATUS ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Core 0 */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Core 0 (Cloud / WiFi)</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">State:</span>
              <span className={`font-medium ${health.core0_is_idle ? 'text-blue-600' : 'text-green-600'}`}>
                {health.core0_is_idle ? '🟦 Idle' : '🟢 Active'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Task:</span>
              <span className="font-mono text-xs font-medium">{health.core0_current_task || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Free Stack:</span>
              <span className="font-medium">{formatBytes(health.core0_free_stack_bytes)}</span>
            </div>
          </div>
        </div>

        {/* Core 1 */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Core 1 (RFID / Access)</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">State:</span>
              <span className={`font-medium ${health.core1_is_idle ? 'text-blue-600' : 'text-green-600'}`}>
                {health.core1_is_idle ? '🟦 Idle' : '🟢 Active'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Task:</span>
              <span className="font-mono text-xs font-medium">{health.core1_current_task || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Free Stack:</span>
              <span className="font-medium">{formatBytes(health.core1_free_stack_bytes)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============ STORAGE ============ */}
      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
        <h3 className="text-sm font-semibold mb-3 text-purple-800">Storage</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LittleFS */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-purple-700">LittleFS (Logs)</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-purple-600">Total:</span>
                <span className="font-medium">{formatBytes(health.storage_littlefs_total_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-600">Used:</span>
                <span className="font-medium">{formatBytes(health.storage_littlefs_used_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-600">Free:</span>
                <span className="font-medium">{formatBytes(health.storage_littlefs_free_bytes)}</span>
              </div>
              {littlefsUsagePercent !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Usage</span>
                    <span>{littlefsUsagePercent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-purple-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{ width: `${Math.min(littlefsUsagePercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* NVS */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-purple-700">NVS (UIDs)</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-purple-600">Used Entries:</span>
                <span className="font-medium">{health.storage_nvs_used_entries ?? 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ WATCHDOG ============ */}
      {health.watchdog_enabled !== null && (
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <h3 className="text-sm font-semibold mb-2 text-orange-800">Watchdog</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-orange-600">Enabled:</span>
              <span className={`font-medium ${health.watchdog_enabled ? 'text-green-600' : 'text-gray-600'}`}>
                {health.watchdog_enabled ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            {health.watchdog_timeout_ms && (
              <div className="flex justify-between">
                <span className="text-orange-600">Timeout:</span>
                <span className="font-medium">{(health.watchdog_timeout_ms / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ FREERTOS TASKS ============ */}
      {health.tasks && health.tasks.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">
            FreeRTOS Tasks ({health.task_count ?? health.tasks.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Name</th>
                  <th className="text-left py-2 px-3">Core</th>
                  <th className="text-left py-2 px-3">Priority</th>
                  <th className="text-left py-2 px-3">Stack High Water</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {health.tasks.map((task, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">{task.name}</td>
                    <td className="py-2 px-3">{task.core}</td>
                    <td className="py-2 px-3">{task.priority}</td>
                    <td className="py-2 px-3">{formatBytes(task.stack_high_water)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${task.is_running ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {task.is_running ? 'Running' : 'Blocked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ UPTIME / FOOTER ============ */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-blue-800">System Uptime</h3>
            <p className="text-blue-700 text-lg font-medium mt-1">{formatUptime(health.uptime_seconds)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-600">Health Updated</p>
            <p className="text-sm font-medium text-blue-700">{lastUpdate.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
