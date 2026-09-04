'use client'

import { useState, useEffect, useCallback } from 'react'
import Shell from '@/components/Shell'
import { fetchAttendance, fetchEmployees } from '@/lib/api'
import type { AttendanceRow, Employee } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageBody,
  PageHeader,
  Spinner,
  TableWrap,
  Td,
  Th,
  Tr,
  cx,
  type Tone,
} from '@/components/ui'
import { IconCalendar, IconUsers, IconClock } from '@/components/icons'

export default function AttendancePage() {
  return (
    <Shell>
      <AttendanceInner />
    </Shell>
  )
}

// Today's date in IST as YYYY-MM-DD
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// "2026-07-06T07:12:34" (IST wall clock from the view) -> "07:12"
function fmtTime(ts: string | null): string {
  if (!ts) return '—'
  return ts.slice(11, 16)
}

// Format a Date as YYYY-MM-DD in LOCAL time.
// (Never use toISOString() here - it converts to UTC and shifts IST back a day.)
function localDayStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end && out.length < 62) {
    out.push(localDayStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out.reverse() // newest first
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return localDayStr(d)
}

type Status = { label: string; tone: Tone }

function statusOf(row: AttendanceRow | undefined): Status {
  if (!row) return { label: 'Absent', tone: 'danger' }
  if (row.late) return { label: 'Late', tone: 'warn' }
  return { label: 'Present', tone: 'ok' }
}

function AttendanceInner() {
  const today = istToday()
  const [fromDay, setFromDay] = useState(today)
  const [toDay, setToDay] = useState(today)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [att, emps] = await Promise.all([
        fetchAttendance(fromDay, toDay),
        fetchEmployees(),
      ])
      setRows(att)
      setEmployees(emps.filter((e) => e.active))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [fromDay, toDay])

  useEffect(() => {
    load()
  }, [load])

  const days = daysBetween(fromDay, toDay)
  const rowFor = (day: string, empId: string) =>
    rows.find((r) => r.day === day && r.employee_id === empId)

  const isToday = fromDay === today && toDay === today

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="Records"
        title="Attendance"
        subtitle="Check-in is the first card scan of the day (06:00–24:00 IST, any linked card); check-out is the last. Anything after 10:00 counts as late."
      />

      {/* date range */}
      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="From" className="sm:w-44">
            <input
              type="date"
              value={fromDay}
              max={toDay}
              onChange={(e) => setFromDay(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="To" className="sm:w-44">
            <input
              type="date"
              value={toDay}
              min={fromDay}
              onChange={(e) => setToDay(e.target.value)}
              className="field"
            />
          </Field>

          <div className="flex flex-wrap gap-2 sm:ml-auto sm:pb-0.5">
            <Button
              variant={isToday ? 'soft' : 'secondary'}
              size="sm"
              onClick={() => {
                setFromDay(today)
                setToDay(today)
              }}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFromDay(shiftDay(today, -6))
                setToDay(today)
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFromDay(shiftDay(today, -29))
                setToDay(today)
              }}
            >
              Last 30 days
            </Button>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted">
          <Spinner className="h-6 w-6 text-brand" />
          <span className="text-sm">Loading attendance…</span>
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconUsers />}
            title="No active employees"
            description="Add people on the Employees page and link their cards to start tracking attendance."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => {
            const dayRows = employees.map((emp) => ({
              emp,
              row: rowFor(day, emp.id),
            }))
            const present = dayRows.filter((d) => d.row && !d.row.late).length
            const late = dayRows.filter((d) => d.row?.late).length
            const absent = dayRows.length - present - late

            return (
              <Card key={day} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
                      <IconCalendar className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight text-ink">
                        {new Date(day + 'T00:00:00').toLocaleDateString('en-IN', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </h2>
                      <p className="text-xs text-subtle">
                        {new Date(day + 'T00:00:00').getFullYear()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="ok">{present} present</Badge>
                    {late > 0 && <Badge tone="warn">{late} late</Badge>}
                    {absent > 0 && <Badge tone="danger">{absent} absent</Badge>}
                  </div>
                </div>

                {/* mobile */}
                <ul className="divide-y divide-line md:hidden">
                  {dayRows.map(({ emp, row }) => {
                    const status = statusOf(row)
                    return (
                      <li
                        key={emp.id}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{emp.name}</p>
                          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted">
                            <IconClock className="h-3.5 w-3.5" />
                            {row ? fmtTime(row.check_in) : '—'}
                            <span className="text-subtle">→</span>
                            {row && row.check_out !== row.check_in
                              ? fmtTime(row.check_out)
                              : '—'}
                            {row && (
                              <span className="ml-1 text-subtle">
                                · {row.scan_count} scans
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </li>
                    )
                  })}
                </ul>

                {/* desktop */}
                <div className="hidden md:block">
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Employee</Th>
                        <Th>Check-in</Th>
                        <Th>Check-out</Th>
                        <Th align="center">Scans</Th>
                        <Th align="right">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayRows.map(({ emp, row }) => {
                        const status = statusOf(row)
                        return (
                          <Tr key={emp.id}>
                            <Td className="font-medium">{emp.name}</Td>
                            <Td
                              className={cx(
                                'font-mono text-sm',
                                row?.late && 'text-warn',
                              )}
                            >
                              {row ? fmtTime(row.check_in) : '—'}
                            </Td>
                            <Td className="font-mono text-sm">
                              {row && row.check_out !== row.check_in
                                ? fmtTime(row.check_out)
                                : '—'}
                            </Td>
                            <Td align="center" className="text-sm tabular-nums text-muted">
                              {row?.scan_count ?? 0}
                            </Td>
                            <Td align="right">
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </Td>
                          </Tr>
                        )
                      })}
                    </tbody>
                  </TableWrap>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageBody>
  )
}
