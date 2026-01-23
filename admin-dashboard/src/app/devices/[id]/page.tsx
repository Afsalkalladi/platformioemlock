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
  sendRemoteUnlock,
  sendGetPending,
  sendSyncUIDs,
  sendSyncLogs,
  sendWhitelistAdd,
  sendBlacklistAdd,
  sendRemoveUID,
  updateUIDName,
} from '@/lib/api'
import type { DeviceDetail, DeviceUID, PendingUID, Command, AccessLog } from '@/lib/types'

type Tab = 'pending' | 'whitelist' | 'blacklist' | 'commands' | 'logs'

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
      const [detailData, pendingData, whitelistData, blacklistData, commandsData, logsData, namesData] =
        await Promise.all([
          fetchDeviceDetail(deviceId),
          fetchPendingUIDs(deviceId),
          fetchWhitelistUIDs(deviceId),
          fetchBlacklistUIDs(deviceId),
          fetchCommandHistory(deviceId),
          fetchAccessLogs(deviceId),
          fetchUIDNames(deviceId),
        ])

      setDetail(detailData)
      setPending(pendingData)
      setWhitelist(whitelistData)
      setBlacklist(blacklistData)
      setCommands(commandsData)
      setLogs(logsData)
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
            {(['pending', 'whitelist', 'blacklist', 'logs', 'commands'] as Tab[]).map((tab) => (
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
