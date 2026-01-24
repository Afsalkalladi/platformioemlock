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

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatBytes = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }

  const getRfidVersionName = (version: number) => {
    switch (version) {
      case 0x91: return 'MFRC522 v1.0'
      case 0x92: return 'MFRC522 v2.0'
      case 0x82: return 'FM17522'
      case 0x88: return 'FM17522E'
      case 0x12: return 'Clone/Compatible'
      case 0x00: return 'No Communication'
      case 0xFF: return 'No Communication'
      default: return `Unknown (0x${version.toString(16).toUpperCase()})`
    }
  }

  const lastUpdate = new Date(health.updated_at)
  const isStale = Date.now() - lastUpdate.getTime() > 120000 // More than 2 minutes old

  return (
    <div className="p-6">
      {/* Status Banner */}
      {isStale && (
        <div className="mb-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded">
          ⚠️ Health data is stale (last update: {lastUpdate.toLocaleString()})
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">System Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Uptime:</span>
              <span className="font-medium">{formatUptime(health.uptime_seconds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Free Memory:</span>
              <span className="font-medium">{formatBytes(health.free_heap_bytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Update:</span>
              <span className="font-medium">{lastUpdate.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* WiFi Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">WiFi Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Connected:</span>
              <span className={`font-medium ${health.wifi_connected ? 'text-green-600' : 'text-red-600'}`}>
                {health.wifi_connected ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Signal:</span>
              <span className="font-medium">{health.wifi_rssi} dBm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">NTP Synced:</span>
              <span className={`font-medium ${health.ntp_synced ? 'text-green-600' : 'text-yellow-600'}`}>
                {health.ntp_synced ? '✓ Yes' : '⏳ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Disconnects:</span>
              <span className={`font-medium ${health.wifi_disconnect_count > 0 ? 'text-yellow-600' : ''}`}>
                {health.wifi_disconnect_count}
              </span>
            </div>
          </div>
        </div>

        {/* RFID Reader Status */}
        <div className={`rounded-lg p-4 ${health.rfid_healthy ? 'bg-gray-50' : 'bg-red-50 border border-red-200'}`}>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">RFID Reader</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`font-medium ${health.rfid_healthy ? 'text-green-600' : 'text-red-600'}`}>
                {health.rfid_healthy ? '✓ Healthy' : '✗ Error'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reader Type:</span>
              <span className="font-medium">{getRfidVersionName(health.rfid_version)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reinit Count:</span>
              <span className={`font-medium ${health.rfid_reinit_count > 0 ? 'text-yellow-600' : ''}`}>
                {health.rfid_reinit_count}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* RFID Error Details (if any) */}
      {health.last_rfid_error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2 text-red-800">Last RFID Error</h3>
          <div className="text-sm">
            <p className="text-red-700 font-medium">{health.last_rfid_error}</p>
            {health.last_rfid_error_time && (
              <p className="text-red-600 mt-1">
                Occurred at: {new Date(health.last_rfid_error_time).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
