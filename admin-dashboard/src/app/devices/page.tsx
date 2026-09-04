'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { fetchDevices, fetchAllDeviceHealthTimestamps } from '@/lib/api'
import type { DeviceSummary } from '@/lib/types'
import Shell from '@/components/Shell'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  PageBody,
  PageHeader,
  PageLoader,
  Stat,
  StatusDot,
  TableWrap,
  Td,
  Th,
  Tr,
  cx,
} from '@/components/ui'
import { relativeTime, dateTime } from '@/lib/format'
import {
  IconChip,
  IconChevronRight,
  IconClock,
  IconInbox,
  IconActivity,
} from '@/components/icons'

export default function DevicesPage() {
  return (
    <Shell>
      <DevicesInner />
    </Shell>
  )
}

interface Row extends DeviceSummary {
  lastSeen: Date
  isOnline: boolean
}

function DevicesInner() {
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [healthTimestamps, setHealthTimestamps] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDevices()
    const interval = setInterval(loadDevices, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadDevices() {
    try {
      const [data, healthTs] = await Promise.all([
        fetchDevices(),
        fetchAllDeviceHealthTimestamps(),
      ])
      setDevices(data)
      setHealthTimestamps(healthTs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <PageBody>
        <PageLoader label="Loading devices…" />
      </PageBody>
    )
  }

  const rows: Row[] = devices.map((device) => {
    const lastCommand = new Date(device.last_command_at)
    const healthAt = healthTimestamps[device.device_id]
      ? new Date(healthTimestamps[device.device_id])
      : null
    // Use the most recent of command timestamp or health heartbeat
    const lastSeen = healthAt && healthAt > lastCommand ? healthAt : lastCommand
    return {
      ...device,
      lastSeen,
      isOnline: Date.now() - lastSeen.getTime() < 120000,
    }
  })

  const online = rows.filter((r) => r.isOnline).length
  const pending = rows.reduce((sum, r) => sum + r.pending_commands, 0)

  return (
    <PageBody>
      <PageHeader
        eyebrow="Fleet"
        title="Devices"
        subtitle="Every ESP32 lock controller reporting to this dashboard. Status refreshes every 5 seconds."
        actions={
          <Badge tone={online === rows.length && rows.length > 0 ? 'ok' : 'neutral'} dot>
            Live
          </Badge>
        }
      />

      {error && <ErrorBanner onRetry={loadDevices}>{error}</ErrorBanner>}

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat
            label="Devices"
            value={rows.length}
            icon={<IconChip className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <Stat
            label="Online"
            value={online}
            hint={`${rows.length - online} offline`}
            icon={<IconActivity className="h-[18px] w-[18px]" />}
            tone={online > 0 ? 'ok' : 'neutral'}
          />
          <Stat
            label="Pending cmds"
            value={pending}
            icon={<IconInbox className="h-[18px] w-[18px]" />}
            tone={pending > 0 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Last contact"
            value={
              rows.length
                ? relativeTime(
                    new Date(Math.max(...rows.map((r) => r.lastSeen.getTime()))),
                  )
                : '—'
            }
            icon={<IconClock className="h-[18px] w-[18px]" />}
            tone="info"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconChip />}
            title="No devices yet"
            description="Devices appear here as soon as one checks in for its first command."
          />
        </Card>
      ) : (
        <>
          {/* ---------- mobile: cards ---------- */}
          <div className="grid gap-3 md:hidden">
            {rows.map((device) => (
              <Link
                key={device.device_id}
                href={`/devices/${device.device_id}`}
                className="focus-ring block rounded-2xl"
              >
                <Card className="p-4 transition active:scale-[.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StatusDot online={device.isOnline} />
                      <span className="truncate font-mono text-sm font-semibold text-ink">
                        {device.device_id}
                      </span>
                    </div>
                    <IconChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone={device.isOnline ? 'ok' : 'neutral'}>
                      {device.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                    {device.pending_commands > 0 && (
                      <Badge tone="warn">{device.pending_commands} pending</Badge>
                    )}
                    <span className="ml-auto text-xs text-subtle">
                      {relativeTime(device.lastSeen)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* ---------- desktop: table ---------- */}
          <Card className="hidden overflow-hidden md:block">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Device</Th>
                  <Th>Status</Th>
                  <Th>Last seen</Th>
                  <Th align="center">Pending</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((device) => (
                  <Tr key={device.device_id} className="group">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <StatusDot online={device.isOnline} />
                        <span className="font-mono text-sm font-medium">
                          {device.device_id}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={device.isOnline ? 'ok' : 'neutral'}>
                        {device.isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="text-sm">{relativeTime(device.lastSeen)}</div>
                      <div className="text-xs text-subtle">
                        {dateTime(device.lastSeen)}
                      </div>
                    </Td>
                    <Td align="center">
                      <span
                        className={cx(
                          'tabular-nums',
                          device.pending_commands > 0
                            ? 'font-semibold text-warn'
                            : 'text-subtle',
                        )}
                      >
                        {device.pending_commands}
                      </span>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/devices/${device.device_id}`}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-soft"
                      >
                        Manage
                        <IconChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </>
      )}
    </PageBody>
  )
}
