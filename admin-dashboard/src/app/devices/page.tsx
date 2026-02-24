'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { fetchDevices, fetchAllDeviceHealthTimestamps } from '@/lib/api'
import type { DeviceSummary } from '@/lib/types'

export default function DevicesPage() {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading devices...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ESP32 RFID Admin</h1>
          <p className="text-gray-600">Manage devices and access control</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {devices.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No devices found. Devices will appear after first command.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Device ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending Commands
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {devices.map((device) => {
                  const lastCommand = new Date(device.last_command_at)
                  const healthAt = healthTimestamps[device.device_id]
                    ? new Date(healthTimestamps[device.device_id])
                    : null
                  // Use the most recent of command timestamp or health heartbeat
                  const lastSeen = healthAt && healthAt > lastCommand ? healthAt : lastCommand
                  const isOnline = Date.now() - lastSeen.getTime() < 120000

                  return (
                    <tr key={device.device_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                        {device.device_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {lastSeen.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {device.pending_commands > 0 ? (
                          <span className="text-yellow-600 font-medium">
                            {device.pending_commands}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isOnline
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {isOnline ? '● Online' : '○ Offline'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/devices/${device.device_id}`}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
