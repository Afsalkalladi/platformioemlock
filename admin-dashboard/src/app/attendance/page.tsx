'use client'

import { useState, useEffect, useCallback } from 'react'
import Shell from '@/components/Shell'
import { fetchAttendance, fetchEmployees } from '@/lib/api'
import type { AttendanceRow, Employee } from '@/lib/types'

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

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end && out.length < 62) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out.reverse() // newest first
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Attendance</h1>
        <p className="text-gray-600 mb-6">
          Check-in = first card scan of the day (06:00–24:00 IST, any of the person&apos;s
          cards). Check-out = last scan. Late = check-in after 10:00.
        </p>

        {/* Date range */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={fromDay}
              max={toDay}
              onChange={(e) => setFromDay(e.target.value)}
              className="border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={toDay}
              min={fromDay}
              onChange={(e) => setToDay(e.target.value)}
              className="border rounded-lg px-3 py-2"
            />
          </div>
          <button
            onClick={() => {
              setFromDay(today)
              setToDay(today)
            }}
            className="text-sm text-blue-600 hover:text-blue-900 font-medium pb-2.5"
          >
            Today
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No active employees. Add them on the Employees page and link their cards.
          </div>
        ) : (
          days.map((day) => (
            <div key={day} className="mb-6">
              <h2 className="font-semibold text-gray-700 mb-2">
                {new Date(day + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-out</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scans</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {employees.map((emp) => {
                      const r = rowFor(day, emp.id)
                      return (
                        <tr key={emp.id}>
                          <td className="px-6 py-4 font-medium">{emp.name}</td>
                          <td className="px-6 py-4 font-mono text-sm">{r ? fmtTime(r.check_in) : '—'}</td>
                          <td className="px-6 py-4 font-mono text-sm">
                            {r ? (r.check_out !== r.check_in ? fmtTime(r.check_out) : '—') : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{r?.scan_count ?? 0}</td>
                          <td className="px-6 py-4">
                            {!r ? (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Absent
                              </span>
                            ) : r.late ? (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Late
                              </span>
                            ) : (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Present
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
