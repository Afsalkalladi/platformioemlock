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
import type {
  DeviceDetail,
  DeviceUID,
  PendingUID,
  Command,
  AccessLog,
  DeviceHealth,
} from '@/lib/types'
import Shell from '@/components/Shell'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Metric,
  PageBody,
  PageLoader,
  Progress,
  StatusDot,
  TableWrap,
  Td,
  Th,
  Tr,
  cx,
  type Tone,
} from '@/components/ui'
import { bytes, dateTime, relativeTime, uptime } from '@/lib/format'
import {
  IconActivity,
  IconArrowLeft,
  IconBan,
  IconCheck,
  IconChip,
  IconClose,
  IconCpu,
  IconDatabase,
  IconInbox,
  IconPencil,
  IconShield,
  IconSync,
  IconTerminal,
  IconTrash,
  IconUnlock,
  IconWifi,
} from '@/components/icons'

type Tab = 'pending' | 'whitelist' | 'blacklist' | 'logs' | 'commands' | 'health'

const TABS: { id: Tab; label: string; Icon: (p: any) => JSX.Element }[] = [
  { id: 'pending', label: 'Pending', Icon: IconInbox },
  { id: 'whitelist', label: 'Whitelist', Icon: IconShield },
  { id: 'blacklist', label: 'Blacklist', Icon: IconBan },
  { id: 'logs', label: 'Access logs', Icon: IconActivity },
  { id: 'commands', label: 'Commands', Icon: IconTerminal },
  { id: 'health', label: 'Health', Icon: IconCpu },
]

export default function DeviceDetailPage() {
  return (
    <Shell>
      <DeviceDetailInner />
    </Shell>
  )
}

function DeviceDetailInner() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  async function loadAll() {
    try {
      const [
        detailData,
        pendingData,
        whitelistData,
        blacklistData,
        commandsData,
        logsData,
        namesData,
        healthData,
      ] = await Promise.all([
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
      <PageBody>
        <PageLoader label="Loading device…" />
      </PageBody>
    )
  }

  const lastSeen = detail ? new Date(detail.last_seen) : null
  // Use health heartbeat (pushed every 60s) as primary online indicator.
  // Threshold = 120s (2× push interval) to avoid false offline during slow cycles.
  const healthTs = health ? new Date(health.updated_at) : null
  const onlineRef = healthTs ?? lastSeen
  const isOnline = onlineRef ? Date.now() - onlineRef.getTime() < 120000 : false

  const counts: Partial<Record<Tab, number>> = {
    pending: pending.length,
    whitelist: whitelist.length,
    blacklist: blacklist.length,
    logs: logs.length,
    commands: commands.length,
  }

  return (
    <PageBody>
      {/* ---------------- header ---------------- */}
      <Link
        href="/devices"
        className="focus-ring -ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:text-brand"
      >
        <IconArrowLeft className="h-4 w-4" />
        All devices
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <IconChip />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {deviceId}
              </h1>
              <p className="mt-0.5 text-xs text-muted">
                Last seen {lastSeen ? relativeTime(lastSeen) : '—'}
                {lastSeen && (
                  <span className="hidden sm:inline"> · {dateTime(lastSeen)}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cx(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
              isOnline
                ? 'bg-ok-soft text-ok ring-ok/25'
                : 'bg-elevated text-muted ring-line',
            )}
          >
            <StatusDot online={isOnline} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {detail && detail.pending_commands > 0 && (
            <Badge tone="warn">{detail.pending_commands} queued</Badge>
          )}
        </div>
      </div>

      {error && <ErrorBanner onRetry={loadAll}>{error}</ErrorBanner>}

      {/* ---------------- quick actions ---------------- */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title="Quick actions"
          subtitle="Commands are queued and confirmed by the device"
        />
        <div className="grid grid-cols-2 gap-2.5 p-4 sm:flex sm:flex-wrap sm:p-5">
          <CommandButton
            label="Remote unlock"
            icon={<IconUnlock className="h-4 w-4" />}
            onClick={() => sendRemoteUnlock(deviceId)}
            onComplete={loadAll}
            variant="primary"
          />
          <CommandButton
            label="Fetch pending"
            icon={<IconInbox className="h-4 w-4" />}
            onClick={() => sendGetPending(deviceId)}
            onComplete={loadAll}
            variant="secondary"
          />
          <CommandButton
            label="Sync UIDs"
            icon={<IconSync className="h-4 w-4" />}
            onClick={() =>
              sendSyncUIDs(
                deviceId,
                whitelist.map((u) => u.uid),
                blacklist.map((u) => u.uid),
              )
            }
            onComplete={loadAll}
            variant="secondary"
          />
          <CommandButton
            label="Sync logs"
            icon={<IconActivity className="h-4 w-4" />}
            onClick={() => sendSyncLogs(deviceId)}
            onComplete={loadAll}
            variant="secondary"
          />
        </div>
      </Card>

      {/* ---------------- tabs ---------------- */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          className="inline-flex min-w-full gap-1 rounded-xl border border-line bg-surface p-1 shadow-card sm:min-w-0"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={cx(
                  'focus-ring flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none',
                  active
                    ? 'bg-brand text-white shadow-sm dark:text-[rgb(var(--c-canvas))]'
                    : 'text-muted hover:bg-elevated hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {counts[id] !== undefined && counts[id]! > 0 && (
                  <span
                    className={cx(
                      'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      active
                        ? 'bg-white/20 dark:bg-black/20'
                        : id === 'pending'
                          ? 'bg-warn-soft text-warn'
                          : 'bg-elevated text-subtle',
                    )}
                  >
                    {counts[id]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ---------------- tab content ---------------- */}
      {activeTab === 'health' ? (
        <HealthTab health={health} />
      ) : (
        <Card className="overflow-hidden">
          {activeTab === 'pending' && (
            <PendingTab pending={pending} deviceId={deviceId} onAction={loadAll} />
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
          {activeTab === 'logs' && (
            <LogsTab logs={logs} uidNames={uidNames} commands={commands} />
          )}
          {activeTab === 'commands' && <CommandsTab commands={commands} />}
        </Card>
      )}
    </PageBody>
  )
}

/* ================================================================== */
/* Pending                                                            */
/* ================================================================== */

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
      <EmptyState
        icon={<IconInbox />}
        title="Nothing pending"
        description="Unknown cards show up here after they are scanned at the reader."
      />
    )
  }

  const actions = (uid: string, size: 'sm' | 'md') => (
    <>
      <CommandButton
        label="Whitelist"
        icon={<IconShield className="h-3.5 w-3.5" />}
        onClick={() => sendWhitelistAdd(deviceId, uid)}
        onComplete={onAction}
        variant="primary"
        size={size}
      />
      <CommandButton
        label="Blacklist"
        icon={<IconBan className="h-3.5 w-3.5" />}
        onClick={() => sendBlacklistAdd(deviceId, uid)}
        onComplete={onAction}
        variant="danger"
        size={size}
      />
      <CommandButton
        label="Ignore"
        onClick={() => sendRemoveUID(deviceId, uid)}
        onComplete={onAction}
        variant="secondary"
        size={size}
      />
    </>
  )

  return (
    <>
      {/* mobile */}
      <ul className="divide-y divide-line md:hidden">
        {pending.map((item) => (
          <li key={item.uid} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm font-semibold">{item.uid}</span>
              <Badge tone="warn">New</Badge>
            </div>
            <p className="mt-1 text-xs text-subtle">
              First seen {relativeTime(item.reported_at)}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">{actions(item.uid, 'sm')}</div>
          </li>
        ))}
      </ul>

      {/* desktop */}
      <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              <Th>Card UID</Th>
              <Th>First seen</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {pending.map((item) => (
              <Tr key={item.uid}>
                <Td>
                  <span className="font-mono text-sm font-medium">{item.uid}</span>
                </Td>
                <Td>
                  <div className="text-sm">{relativeTime(item.reported_at)}</div>
                  <div className="text-xs text-subtle">{dateTime(item.reported_at)}</div>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-2">{actions(item.uid, 'sm')}</div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  )
}

/* ================================================================== */
/* Whitelist / Blacklist                                              */
/* ================================================================== */

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
      <EmptyState
        icon={type === 'whitelist' ? <IconShield /> : <IconBan />}
        title={`No ${type} entries yet`}
        description={
          type === 'whitelist'
            ? 'Approve a card from the Pending tab to add it here.'
            : 'Blocked cards will be listed here.'
        }
      />
    )
  }

  const nameCell = (item: DeviceUID) =>
    editingId === item.id ? (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveName(item.id)
            if (e.key === 'Escape') setEditingId(null)
          }}
          className="field h-8 w-32 py-1 text-sm"
          placeholder="Card label"
          autoFocus
        />
        <button
          onClick={() => handleSaveName(item.id)}
          title="Save"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-ok transition hover:bg-ok-soft"
        >
          <IconCheck className="h-4 w-4" />
        </button>
        <button
          onClick={() => setEditingId(null)}
          title="Cancel"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-elevated"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-1.5">
        <span className={item.name ? 'text-sm font-medium' : 'text-sm italic text-subtle'}>
          {item.name || 'Unnamed'}
        </span>
        <button
          onClick={() => {
            setEditingId(item.id)
            setEditName(item.name || '')
          }}
          title="Rename"
          className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-elevated hover:text-ink"
        >
          <IconPencil className="h-3.5 w-3.5" />
        </button>
      </div>
    )

  return (
    <>
      {/* mobile */}
      <ul className="divide-y divide-line md:hidden">
        {uids.map((item) => (
          <li key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{item.uid}</div>
                <div className="mt-1">{nameCell(item)}</div>
                <p className="mt-1 text-xs text-subtle">
                  Updated {relativeTime(item.updated_at)}
                </p>
              </div>
              <CommandButton
                label="Remove"
                icon={<IconTrash className="h-3.5 w-3.5" />}
                onClick={() => sendRemoveUID(deviceId, item.uid)}
                onComplete={onAction}
                variant="secondary"
                size="sm"
              />
            </div>
          </li>
        ))}
      </ul>

      {/* desktop */}
      <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              <Th>Card UID</Th>
              <Th>Label</Th>
              <Th>Last updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {uids.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <span className="font-mono text-sm font-medium">{item.uid}</span>
                </Td>
                <Td>{nameCell(item)}</Td>
                <Td>
                  <div className="text-sm">{relativeTime(item.updated_at)}</div>
                  <div className="text-xs text-subtle">{dateTime(item.updated_at)}</div>
                </Td>
                <Td align="right">
                  <CommandButton
                    label="Remove"
                    icon={<IconTrash className="h-3.5 w-3.5" />}
                    onClick={() => sendRemoveUID(deviceId, item.uid)}
                    onComplete={onAction}
                    variant="secondary"
                    size="sm"
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  )
}

/* ================================================================== */
/* Access logs                                                        */
/* ================================================================== */

const EVENT_TONE: Record<string, Tone> = {
  GRANTED: 'ok',
  DENIED: 'danger',
  PENDING: 'warn',
  REMOTE: 'info',
}

function LogsTab({
  logs,
  uidNames,
  commands,
}: {
  logs: AccessLog[]
  uidNames: Record<string, string>
  commands: Command[]
}) {
  // For REMOTE events the device doesn't know WHO pressed unlock - but the
  // matching REMOTE_UNLOCK command does (issued_by = unlock-key label or
  // "admin-dashboard"). Match by closest timestamp within 3 minutes.
  const remoteActorFor = (log: AccessLog): string | null => {
    if (log.event_type !== 'REMOTE') return null
    const logTs = new Date(log.logged_at).getTime()
    let best: { diff: number; actor: string } | null = null
    for (const cmd of commands) {
      if (cmd.type !== 'REMOTE_UNLOCK' || !cmd.issued_by) continue
      const cmdTs = new Date(cmd.acked_at ?? cmd.created_at).getTime()
      const diff = Math.abs(cmdTs - logTs)
      if (diff <= 3 * 60 * 1000 && (!best || diff < best.diff)) {
        best = { diff, actor: cmd.issued_by }
      }
    }
    return best?.actor ?? null
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<IconActivity />}
        title="No access logs yet"
        description="Entries appear as cards are scanned or the door is unlocked remotely."
      />
    )
  }

  const who = (log: AccessLog) =>
    log.event_type === 'REMOTE' ? (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-info">
        <IconUnlock className="h-4 w-4" />
        {remoteActorFor(log) ?? 'unknown key'}
      </span>
    ) : (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm">{log.uid}</span>
        {uidNames[log.uid] && (
          <span className="text-xs font-medium text-brand">{uidNames[log.uid]}</span>
        )}
      </span>
    )

  return (
    <>
      {/* mobile */}
      <ul className="divide-y divide-line md:hidden">
        {logs.map((log) => (
          <li key={log.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              {who(log)}
              <p className="mt-1 text-xs text-subtle">{dateTime(log.logged_at)}</p>
            </div>
            <Badge tone={EVENT_TONE[log.event_type] ?? 'neutral'}>
              {log.event_type}
            </Badge>
          </li>
        ))}
      </ul>

      {/* desktop */}
      <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Card / actor</Th>
              <Th align="right">Event</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <Tr key={log.id}>
                <Td>
                  <div className="text-sm">{dateTime(log.logged_at)}</div>
                  <div className="text-xs text-subtle">{relativeTime(log.logged_at)}</div>
                </Td>
                <Td>{who(log)}</Td>
                <Td align="right">
                  <Badge tone={EVENT_TONE[log.event_type] ?? 'neutral'}>
                    {log.event_type}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  )
}

/* ================================================================== */
/* Commands                                                           */
/* ================================================================== */

function CommandsTab({ commands }: { commands: Command[] }) {
  if (commands.length === 0) {
    return (
      <EmptyState
        icon={<IconTerminal />}
        title="No command history"
        description="Commands you send from Quick actions are tracked here."
      />
    )
  }

  const statusTone = (s: Command['status']): Tone =>
    s === 'DONE' ? 'ok' : s === 'FAILED' ? 'danger' : 'warn'

  return (
    <>
      {/* mobile */}
      <ul className="divide-y divide-line md:hidden">
        {commands.map((cmd) => (
          <li key={cmd.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{cmd.type}</span>
              <Badge tone={statusTone(cmd.status)}>{cmd.status}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
              <span>{dateTime(cmd.created_at)}</span>
              {cmd.uid && <span className="font-mono">{cmd.uid}</span>}
              {cmd.issued_by && <span>by {cmd.issued_by}</span>}
            </div>
            {cmd.result && (
              <p className="mt-1.5 truncate text-xs text-muted">{cmd.result}</p>
            )}
          </li>
        ))}
      </ul>

      {/* desktop */}
      <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Type</Th>
              <Th>UID</Th>
              <Th>Issued by</Th>
              <Th>Status</Th>
              <Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {commands.map((cmd) => (
              <Tr key={cmd.id}>
                <Td className="whitespace-nowrap text-sm text-muted">
                  {dateTime(cmd.created_at)}
                </Td>
                <Td className="whitespace-nowrap text-sm font-medium">{cmd.type}</Td>
                <Td className="font-mono text-xs">{cmd.uid || '—'}</Td>
                <Td className="text-xs text-muted">{cmd.issued_by || '—'}</Td>
                <Td>
                  <Badge tone={statusTone(cmd.status)}>{cmd.status}</Badge>
                </Td>
                <Td className="max-w-xs truncate text-xs text-muted">
                  {cmd.result || '—'}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  )
}

/* ================================================================== */
/* Health                                                             */
/* ================================================================== */

function HealthCard({
  title,
  icon,
  tone = 'neutral',
  children,
  className,
}: {
  title: string
  icon?: React.ReactNode
  tone?: Tone
  children: React.ReactNode
  className?: string
}) {
  const ring: Record<Tone, string> = {
    neutral: 'text-subtle bg-elevated',
    brand: 'text-brand bg-brand-soft',
    ok: 'text-ok bg-ok-soft',
    warn: 'text-warn bg-warn-soft',
    danger: 'text-danger bg-danger-soft',
    info: 'text-info bg-info-soft',
  }
  return (
    <Card className={cx('p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-center gap-2.5">
        {icon && (
          <span className={cx('grid h-8 w-8 place-items-center rounded-lg', ring[tone])}>
            {icon}
          </span>
        )}
        <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
      </div>
      <div className="divide-y divide-line/70">{children}</div>
    </Card>
  )
}

function HealthTab({ health }: { health: DeviceHealth | null }) {
  if (!health) {
    return (
      <Card>
        <EmptyState
          icon={<IconCpu />}
          title="No health data yet"
          description="Diagnostics appear once the device starts pushing its heartbeat."
        />
      </Card>
    )
  }

  const formatPercent = (value: number | null) =>
    value === null ? 'N/A' : `${value.toFixed(1)}%`

  const rfidChipName = (ic: number | null) => {
    if (ic === null || ic === undefined) return 'N/A'
    if (ic === 0x32) return 'PN532'
    if (ic === 0x00) return 'No comms'
    return `Unknown (0x${ic.toString(16).toUpperCase()})`
  }

  const chipModelName = (model: number | null) => {
    if (model === null) return 'N/A'
    switch (model) {
      case 0:
        return 'ESP32'
      case 2:
        return 'ESP32-S2'
      case 9:
        return 'ESP32-C3'
      case 5:
        return 'ESP32-S3'
      default:
        return `Model ${model}`
    }
  }

  const signalQuality = (rssi: number): { label: string; tone: Tone } => {
    if (rssi >= -50) return { label: 'Excellent', tone: 'ok' }
    if (rssi >= -60) return { label: 'Good', tone: 'ok' }
    if (rssi >= -70) return { label: 'Fair', tone: 'warn' }
    return { label: 'Weak', tone: 'danger' }
  }

  const voltageTone = (v: number): Tone =>
    v < 3.0 ? 'danger' : v < 3.1 ? 'warn' : 'ok'

  const lastUpdate = new Date(health.updated_at)
  const isStale = Date.now() - lastUpdate.getTime() > 120000

  const heapUsed =
    health.total_heap_bytes && health.free_heap_bytes
      ? health.total_heap_bytes - health.free_heap_bytes
      : null
  const heapUsagePercent =
    health.total_heap_bytes && heapUsed
      ? (heapUsed / health.total_heap_bytes) * 100
      : null

  const littlefsUsagePercent =
    health.storage_littlefs_total_bytes && health.storage_littlefs_used_bytes
      ? (health.storage_littlefs_used_bytes / health.storage_littlefs_total_bytes) * 100
      : null

  const signal = signalQuality(health.wifi_rssi)
  const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`

  return (
    <div className="space-y-4 sm:space-y-5">
      {isStale && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <IconClose className="mt-0.5 h-4 w-4 shrink-0 rotate-45" />
          <span>
            Health data is stale — last update {relativeTime(lastUpdate)} (
            {dateTime(lastUpdate)}).
          </span>
        </div>
      )}

      {/* ---- headline strip ---- */}
      <Card className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        <div className="border-b border-line p-4 sm:border-b-0">
          <p className="text-xs uppercase tracking-wider text-subtle">Uptime</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
            {uptime(health.uptime_seconds)}
          </p>
        </div>
        <div className="border-b border-l border-line p-4 sm:border-b-0 sm:border-l-0">
          <p className="text-xs uppercase tracking-wider text-subtle">Wi-Fi</p>
          <p
            className={cx(
              'mt-1 text-lg font-semibold tabular-nums',
              signal.tone === 'ok'
                ? 'text-ok'
                : signal.tone === 'warn'
                  ? 'text-warn'
                  : 'text-danger',
            )}
          >
            {health.wifi_rssi} dBm
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs uppercase tracking-wider text-subtle">Heap used</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
            {formatPercent(heapUsagePercent)}
          </p>
        </div>
        <div className="border-l border-line p-4 sm:border-l-0">
          <p className="text-xs uppercase tracking-wider text-subtle">Reader</p>
          <p
            className={cx(
              'mt-1 text-lg font-semibold',
              health.rfid_healthy ? 'text-ok' : 'text-danger',
            )}
          >
            {health.rfid_healthy ? 'Healthy' : 'Fault'}
          </p>
        </div>
      </Card>

      {/* ---- summary cards ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          title="RFID reader"
          icon={<IconChip className="h-[18px] w-[18px]" />}
          tone={health.rfid_healthy ? 'ok' : 'danger'}
        >
          <Metric
            label="Status"
            value={health.rfid_healthy ? 'Healthy' : 'Error'}
            tone={health.rfid_healthy ? 'ok' : 'danger'}
          />
          <Metric label="Chip" value={rfidChipName(health.rfid_ic)} />
          <Metric
            label="SPI comms"
            value={health.rfid_communication_ok ? 'OK' : 'Failed'}
            tone={health.rfid_communication_ok ? 'ok' : 'danger'}
          />
          <Metric
            label="SAM config"
            value={health.rfid_sam_configured ? 'OK' : 'Failed'}
            tone={health.rfid_sam_configured ? 'ok' : 'danger'}
          />
          {health.rfid_firmware_major !== null && health.rfid_firmware_minor !== null && (
            <Metric
              label="Firmware"
              value={`${health.rfid_firmware_major}.${health.rfid_firmware_minor}`}
            />
          )}
          {health.voltage_3v3 != null && (
            <Metric
              label="Supply"
              value={`${health.voltage_3v3.toFixed(2)} V`}
              tone={voltageTone(health.voltage_3v3)}
            />
          )}
        </HealthCard>

        <HealthCard
          title="Wi-Fi"
          icon={<IconWifi className="h-[18px] w-[18px]" />}
          tone={health.wifi_connected ? 'ok' : 'danger'}
        >
          <Metric
            label="Status"
            value={health.wifi_connected ? 'Connected' : 'Disconnected'}
            tone={health.wifi_connected ? 'ok' : 'danger'}
          />
          <Metric
            label="Signal"
            value={`${health.wifi_rssi} dBm · ${signal.label}`}
            tone={signal.tone}
          />
          <Metric
            label="NTP sync"
            value={health.ntp_synced ? 'Synced' : 'Waiting'}
            tone={health.ntp_synced ? 'ok' : 'warn'}
          />
          <Metric label="Disconnects" value={health.wifi_disconnect_count} />
        </HealthCard>

        <HealthCard
          title="Memory"
          icon={<IconDatabase className="h-[18px] w-[18px]" />}
          tone="brand"
        >
          <Metric label="Total" value={bytes(health.total_heap_bytes)} />
          <Metric label="Free" value={bytes(health.free_heap_bytes)} />
          <Metric label="Used" value={bytes(heapUsed)} />
          {health.min_free_heap_bytes != null && (
            <Metric label="Min free" value={bytes(health.min_free_heap_bytes)} />
          )}
          {heapUsagePercent !== null && (
            <div className="pt-3">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>Heap usage</span>
                <span className="tabular-nums">{formatPercent(heapUsagePercent)}</span>
              </div>
              <Progress
                value={heapUsagePercent}
                tone={
                  heapUsagePercent > 80 ? 'danger' : heapUsagePercent > 60 ? 'warn' : 'ok'
                }
              />
            </div>
          )}
        </HealthCard>

        <HealthCard
          title="Processor"
          icon={<IconCpu className="h-[18px] w-[18px]" />}
          tone="info"
        >
          <Metric label="Model" value={chipModelName(health.chip_model)} />
          <Metric label="Cores" value={health.chip_cores ?? 'N/A'} />
          <Metric
            label="Frequency"
            value={health.cpu_freq_mhz ? `${health.cpu_freq_mhz} MHz` : 'N/A'}
          />
          <Metric label="Revision" value={health.chip_revision ?? 'N/A'} />
          {health.firmware_version && (
            <Metric label="Firmware" value={health.firmware_version} mono />
          )}
        </HealthCard>
      </div>

      {/* ---- PN532 details ---- */}
      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink">
          PN532 reader details
        </h3>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          <Metric
            label="IC code"
            value={health.rfid_ic != null ? hex(health.rfid_ic) : 'N/A'}
            mono
          />
          <Metric
            label="Firmware"
            value={
              health.rfid_firmware_major !== null && health.rfid_firmware_minor !== null
                ? `${health.rfid_firmware_major}.${health.rfid_firmware_minor}`
                : 'N/A'
            }
          />
          <Metric
            label="Support flags"
            value={
              health.rfid_firmware_support != null
                ? hex(health.rfid_firmware_support)
                : 'N/A'
            }
            mono
          />
          <Metric
            label="SPI communication"
            value={health.rfid_communication_ok ? 'OK' : 'Failed'}
            tone={health.rfid_communication_ok ? 'ok' : 'danger'}
          />
          <Metric
            label="SAM configuration"
            value={health.rfid_sam_configured ? 'Configured' : 'Not configured'}
            tone={health.rfid_sam_configured ? 'ok' : 'danger'}
          />
          <Metric
            label="Overall health"
            value={health.rfid_healthy ? 'Healthy' : 'Unhealthy'}
            tone={health.rfid_healthy ? 'ok' : 'danger'}
          />
          <Metric
            label="Total polls"
            value={health.rfid_poll_count?.toLocaleString() ?? 'N/A'}
          />
          <Metric
            label="Reader reinits"
            value={health.rfid_reinit_count}
            tone={health.rfid_reinit_count > 3 ? 'danger' : undefined}
          />
          {health.last_successful_read_time && (
            <Metric
              label="Last read"
              value={relativeTime(health.last_successful_read_time)}
            />
          )}
        </div>
      </Card>

      {/* ---- RFID error ---- */}
      {health.last_rfid_error && (
        <Card className="border-danger/30 bg-danger-soft p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-danger">Last RFID error</h3>
          <p className="mt-1.5 text-sm text-danger">{health.last_rfid_error}</p>
          {health.last_rfid_error_time && (
            <p className="mt-1 text-xs text-danger/80">
              {dateTime(health.last_rfid_error_time)} ·{' '}
              {relativeTime(health.last_rfid_error_time)}
            </p>
          )}
        </Card>
      )}

      {/* ---- cores ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            title: 'Core 0 · Cloud / Wi-Fi',
            idle: health.core0_is_idle,
            task: health.core0_current_task,
            stack: health.core0_free_stack_bytes,
          },
          {
            title: 'Core 1 · RFID / Access',
            idle: health.core1_is_idle,
            task: health.core1_current_task,
            stack: health.core1_free_stack_bytes,
          },
        ].map((core) => (
          <HealthCard
            key={core.title}
            title={core.title}
            icon={<IconActivity className="h-[18px] w-[18px]" />}
            tone={core.idle ? 'info' : 'ok'}
          >
            <Metric
              label="State"
              value={core.idle ? 'Idle' : 'Active'}
              tone={core.idle ? 'info' : 'ok'}
            />
            <Metric label="Task" value={core.task || 'N/A'} mono />
            <Metric label="Free stack" value={bytes(core.stack)} />
          </HealthCard>
        ))}
      </div>

      {/* ---- storage + watchdog ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <HealthCard
          title="Storage"
          icon={<IconDatabase className="h-[18px] w-[18px]" />}
          tone="brand"
        >
          <Metric label="LittleFS total" value={bytes(health.storage_littlefs_total_bytes)} />
          <Metric label="LittleFS used" value={bytes(health.storage_littlefs_used_bytes)} />
          <Metric label="LittleFS free" value={bytes(health.storage_littlefs_free_bytes)} />
          <Metric label="NVS entries" value={health.storage_nvs_used_entries ?? 'N/A'} />
          {littlefsUsagePercent !== null && (
            <div className="pt-3">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>Log storage</span>
                <span className="tabular-nums">
                  {littlefsUsagePercent.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={littlefsUsagePercent}
                tone={
                  littlefsUsagePercent > 85
                    ? 'danger'
                    : littlefsUsagePercent > 65
                      ? 'warn'
                      : 'brand'
                }
              />
            </div>
          )}
        </HealthCard>

        <HealthCard
          title="Watchdog & heartbeat"
          icon={<IconShield className="h-[18px] w-[18px]" />}
          tone={isStale ? 'warn' : 'ok'}
        >
          {health.watchdog_enabled !== null && (
            <Metric
              label="Watchdog"
              value={health.watchdog_enabled ? 'Enabled' : 'Disabled'}
              tone={health.watchdog_enabled ? 'ok' : 'warn'}
            />
          )}
          {health.watchdog_timeout_ms && (
            <Metric
              label="Timeout"
              value={`${(health.watchdog_timeout_ms / 1000).toFixed(1)} s`}
            />
          )}
          <Metric label="Uptime" value={uptime(health.uptime_seconds)} />
          <Metric
            label="Health updated"
            value={relativeTime(lastUpdate)}
            tone={isStale ? 'warn' : 'ok'}
          />
        </HealthCard>
      </div>

      {/* ---- FreeRTOS tasks ---- */}
      {health.tasks && health.tasks.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title="FreeRTOS tasks"
            subtitle={`${health.task_count ?? health.tasks.length} tasks scheduled`}
          />
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th align="center">Core</Th>
                <Th align="center">Priority</Th>
                <Th align="right">Stack high water</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {health.tasks.map((task, idx) => (
                <Tr key={idx}>
                  <Td className="font-mono text-xs">{task.name}</Td>
                  <Td align="center" className="text-sm tabular-nums">
                    {task.core}
                  </Td>
                  <Td align="center" className="text-sm tabular-nums">
                    {task.priority}
                  </Td>
                  <Td align="right" className="text-sm tabular-nums">
                    {bytes(task.stack_high_water)}
                  </Td>
                  <Td align="right">
                    <Badge tone={task.is_running ? 'ok' : 'neutral'}>
                      {task.is_running ? 'Running' : 'Blocked'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  )
}
