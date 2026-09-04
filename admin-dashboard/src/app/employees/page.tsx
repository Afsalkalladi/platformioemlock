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
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  PageBody,
  PageHeader,
  PageLoader,
  Stat,
  TableWrap,
  Td,
  Th,
  Tr,
  cx,
} from '@/components/ui'
import {
  IconPlus,
  IconUsers,
  IconKey,
  IconPencil,
  IconTrash,
  IconLink,
  IconCheck,
  IconBan,
} from '@/components/icons'

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
  const [saving, setSaving] = useState(false)
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
    setSaving(true)
    try {
      await createEmployee(newName.trim())
      setNewName('')
      await load()
    } finally {
      setSaving(false)
    }
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
    if (!confirm(`Delete ${emp.name}? Their cards stay whitelisted but become unassigned.`))
      return
    await deleteEmployee(emp.id)
    await load()
  }

  async function handleAssign(card: DeviceUID, employeeId: string) {
    await assignCardToEmployee(card.id, employeeId === '' ? null : employeeId)
    await load()
  }

  const cardsFor = (empId: string) => cards.filter((c) => c.employee_id === empId)
  const whitelistCards = cards.filter((c) => c.state === 'WHITELIST')
  const unassigned = whitelistCards.filter((c) => !c.employee_id).length

  if (loading) {
    return (
      <PageBody width="narrow">
        <PageLoader label="Loading employees…" />
      </PageBody>
    )
  }

  const rowActions = (emp: Employee) => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleRename(emp)}
        title="Rename"
        className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-elevated hover:text-ink"
      >
        <IconPencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleToggleActive(emp)}
        title={emp.active ? 'Deactivate' : 'Activate'}
        className={cx(
          'focus-ring grid h-8 w-8 place-items-center rounded-lg transition',
          emp.active
            ? 'text-subtle hover:bg-warn-soft hover:text-warn'
            : 'text-subtle hover:bg-ok-soft hover:text-ok',
        )}
      >
        {emp.active ? <IconBan className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
      </button>
      <button
        onClick={() => handleDelete(emp)}
        title="Delete"
        className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-danger-soft hover:text-danger"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </div>
  )

  const cardChips = (empId: string) => {
    const list = cardsFor(empId)
    if (list.length === 0)
      return <span className="text-xs font-medium text-warn">No cards linked</span>
    return (
      <div className="flex flex-wrap gap-1">
        {list.map((c) => (
          <span
            key={c.id}
            className="inline-flex rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-brand"
          >
            {c.uid}
          </span>
        ))}
      </div>
    )
  }

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="People"
        title="Employees"
        subtitle="One person can carry several RFID cards — link every card they use. Attendance merges scans from all of them."
      />

      {error && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <Stat
          label="Employees"
          value={employees.length}
          icon={<IconUsers className="h-[18px] w-[18px]" />}
          tone="brand"
        />
        <Stat
          label="Active"
          value={employees.filter((e) => e.active).length}
          icon={<IconCheck className="h-[18px] w-[18px]" />}
          tone="ok"
        />
        <Stat
          label="Unassigned cards"
          value={unassigned}
          icon={<IconKey className="h-[18px] w-[18px]" />}
          tone={unassigned > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* add employee */}
      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Employee name"
            className="field sm:flex-1"
          />
          <Button
            type="submit"
            disabled={!newName.trim()}
            loading={saving}
            icon={<IconPlus className="h-4 w-4" />}
          >
            Add employee
          </Button>
        </form>
      </Card>

      {/* employee list */}
      <Card className="mb-8 overflow-hidden">
        <CardHeader title="Team" subtitle={`${employees.length} on record`} />

        {employees.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title="No employees yet"
            description="Add the first person above, then link their card below."
          />
        ) : (
          <>
            {/* mobile */}
            <ul className="divide-y divide-line md:hidden">
              {employees.map((emp) => (
                <li key={emp.id} className={cx('p-4', !emp.active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{emp.name}</span>
                        <Badge tone={emp.active ? 'ok' : 'neutral'}>
                          {emp.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-2">{cardChips(emp.id)}</div>
                    </div>
                    {rowActions(emp)}
                  </div>
                </li>
              ))}
            </ul>

            {/* desktop */}
            <div className="hidden md:block">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Linked cards</Th>
                    <Th>Status</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <Tr key={emp.id} className={cx(!emp.active && 'opacity-60')}>
                      <Td className="font-medium">{emp.name}</Td>
                      <Td>{cardChips(emp.id)}</Td>
                      <Td>
                        <Badge tone={emp.active ? 'ok' : 'neutral'}>
                          {emp.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end">{rowActions(emp)}</div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      {/* card assignment */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Card assignment"
          subtitle="Every whitelisted card across devices — assign each to the person who carries it."
          actions={
            unassigned > 0 ? (
              <Badge tone="warn">{unassigned} unassigned</Badge>
            ) : (
              <Badge tone="ok">All assigned</Badge>
            )
          }
        />

        {whitelistCards.length === 0 ? (
          <EmptyState
            icon={<IconLink />}
            title="No whitelisted cards yet"
            description="Approve a card on a device's Pending tab and it will show up here."
          />
        ) : (
          <>
            {/* mobile */}
            <ul className="divide-y divide-line md:hidden">
              {whitelistCards.map((card) => (
                <li key={card.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-semibold">{card.uid}</span>
                    {!card.employee_id && <Badge tone="warn">Unassigned</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-subtle">
                    {card.name || 'No label'} · <span className="font-mono">{card.device_id}</span>
                  </p>
                  <select
                    value={card.employee_id ?? ''}
                    onChange={(e) => handleAssign(card, e.target.value)}
                    className="field mt-3"
                  >
                    <option value="">— Unassigned —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
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
                    <Th>Device</Th>
                    <Th align="right">Assigned to</Th>
                  </tr>
                </thead>
                <tbody>
                  {whitelistCards.map((card) => (
                    <Tr key={card.id}>
                      <Td className="font-mono text-sm">{card.uid}</Td>
                      <Td className="text-sm text-muted">{card.name || '—'}</Td>
                      <Td className="font-mono text-xs text-subtle">{card.device_id}</Td>
                      <Td align="right">
                        <select
                          value={card.employee_id ?? ''}
                          onChange={(e) => handleAssign(card, e.target.value)}
                          className="field ml-auto h-9 w-48 py-1.5"
                        >
                          <option value="">— Unassigned —</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>
    </PageBody>
  )
}
