'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/Shell'
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchAllCards,
  assignCardToEmployee,
} from '@/lib/api'
import type { Employee, DeviceUID } from '@/lib/types'

export default function EmployeesPage() {
  return (
    <Shell>
      <EmployeesInner />
    </Shell>
  )
}

function EmployeesInner() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [cards, setCards] = useState<DeviceUID[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [emps, allCards] = await Promise.all([fetchEmployees(), fetchAllCards()])
      setEmployees(emps)
      setCards(allCards)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await createEmployee(newName.trim())
    setNewName('')
    await load()
  }

  async function handleToggleActive(emp: Employee) {
    await updateEmployee(emp.id, { active: !emp.active })
    await load()
  }

  async function handleRename(emp: Employee) {
    const name = prompt('New name:', emp.name)
    if (name && name.trim() && name !== emp.name) {
      await updateEmployee(emp.id, { name: name.trim() })
      await load()
    }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Delete ${emp.name}? Their cards stay whitelisted but become unassigned.`)) return
    await deleteEmployee(emp.id)
    await load()
  }

  async function handleAssign(card: DeviceUID, employeeId: string) {
    await assignCardToEmployee(card.id, employeeId === '' ? null : employeeId)
    await load()
  }

  const cardsFor = (empId: string) => cards.filter((c) => c.employee_id === empId)
  const whitelistCards = cards.filter((c) => c.state === 'WHITELIST')

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Employees</h1>
        <p className="text-gray-600 mb-6">
          An employee can have multiple RFID cards — link every card they carry.
          Attendance combines scans from all of a person&apos;s cards.
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Add employee */}
        <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Employee name"
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium"
          >
            Add employee
          </button>
        </form>

        {/* Employee list */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cards</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {employees.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    No employees yet. Add your six above.
                  </td>
                </tr>
              )}
              {employees.map((emp) => (
                <tr key={emp.id} className={emp.active ? '' : 'bg-gray-50 text-gray-400'}>
                  <td className="px-6 py-4 font-medium">{emp.name}</td>
                  <td className="px-6 py-4 text-sm">
                    {cardsFor(emp.id).length === 0 ? (
                      <span className="text-orange-500">No cards linked</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {cardsFor(emp.id).map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-xs"
                          >
                            {c.uid}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        emp.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm space-x-3 whitespace-nowrap">
                    <button onClick={() => handleRename(emp)} className="text-blue-600 hover:text-blue-900">
                      Rename
                    </button>
                    <button onClick={() => handleToggleActive(emp)} className="text-gray-600 hover:text-gray-900">
                      {emp.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(emp)} className="text-red-600 hover:text-red-900">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Card assignment */}
        <h2 className="text-xl font-bold mb-3">Card assignment</h2>
        <p className="text-gray-600 text-sm mb-4">
          All whitelisted cards across devices. Assign each one to the person who carries it.
        </p>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Card UID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Card label</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {whitelistCards.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    No whitelisted cards yet.
                  </td>
                </tr>
              )}
              {whitelistCards.map((card) => (
                <tr key={card.id}>
                  <td className="px-6 py-4 font-mono text-sm">{card.uid}</td>
                  <td className="px-6 py-4 text-sm">{card.name || '—'}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{card.device_id}</td>
                  <td className="px-6 py-4">
                    <select
                      value={card.employee_id ?? ''}
                      onChange={(e) => handleAssign(card, e.target.value)}
                      className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Unassigned —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
