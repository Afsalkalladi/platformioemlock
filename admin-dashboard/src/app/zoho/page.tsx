'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Shell from '@/components/Shell'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageBody,
  PageHeader,
  PageLoader,
  TableWrap,
  Td,
  Th,
  Tr,
  Field,
  type Tone,
} from '@/components/ui'
import { dateTime, relativeTime } from '@/lib/format'
import { IconSync, IconLink, IconTrash, IconCheck, IconActivity } from '@/components/icons'

interface Mapping {
  uid: string
  zoho_emp_id: string | null
  email: string | null
  full_name: string | null
  active: boolean
}

interface SyncRow {
  id: string
  uid: string
  employee: string
  logged_at: string
  zoho_direction: string | null
  zoho_status: string | null
}

export default function ZohoPage() {
  return (
    <Shell>
      <ZohoInner />
    </Shell>
  )
}

function statusTone(status: string | null): Tone {
  if (!status) return 'warn'
  if (status === 'OK') return 'ok'
  if (status.startsWith('SKIPPED')) return 'neutral'
  return 'danger'
}

function ZohoInner() {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [recent, setRecent] = useState<SyncRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Mapping>({
    uid: '',
    zoho_emp_id: '',
    email: '',
    full_name: '',
    active: true,
  })
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [{ data: maps }, { data: sync }, { data: uids }] = await Promise.all([
      supabase.from('zoho_employee_map').select('*').order('full_name'),
      supabase.from('zoho_sync_overview').select('*').limit(25),
      supabase.from('device_uids').select('uid').eq('state', 'WHITELIST'),
    ])

    setMappings(maps ?? [])
    setRecent(sync ?? [])

    // Whitelisted cards that have no Zoho mapping yet
    const mapped = new Set((maps ?? []).map((m) => m.uid.toUpperCase()))
    const all = new Set((uids ?? []).map((u: { uid: string }) => u.uid.toUpperCase()))
    setUnmapped([...all].filter((u) => !mapped.has(u)))

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!draft.uid.trim()) return
    if (!draft.zoho_emp_id?.trim() && !draft.email?.trim()) {
      setMsg({
        text: 'Provide a Zoho Employee ID or email (or set the Mapper ID in Zoho to this UID instead).',
        tone: 'warn',
      })
      return
    }

    setSaving(true)
    const { error } = await supabase.from('zoho_employee_map').upsert({
      uid: draft.uid.trim().toUpperCase(),
      zoho_emp_id: draft.zoho_emp_id?.trim() || null,
      email: draft.email?.trim() || null,
      full_name: draft.full_name?.trim() || null,
      active: draft.active,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)

    setMsg(
      error ? { text: error.message, tone: 'danger' } : { text: 'Mapping saved', tone: 'ok' },
    )
    if (!error) {
      setDraft({ uid: '', zoho_emp_id: '', email: '', full_name: '', active: true })
      load()
    }
  }

  async function remove(uid: string) {
    if (!confirm(`Remove the Zoho mapping for ${uid}?`)) return
    await supabase.from('zoho_employee_map').delete().eq('uid', uid)
    load()
  }

  if (loading) {
    return (
      <PageBody width="narrow">
        <PageLoader label="Loading Zoho mappings…" />
      </PageBody>
    )
  }

  const msgClasses: Record<Tone, string> = {
    ok: 'border-ok/30 bg-ok-soft text-ok',
    warn: 'border-warn/30 bg-warn-soft text-warn',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    info: 'border-info/30 bg-info-soft text-info',
    brand: 'border-brand/30 bg-brand-soft text-brand',
    neutral: 'border-line bg-elevated text-muted',
  }

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="Integration"
        title="Zoho People"
        subtitle="Map RFID cards to Zoho employees. Card taps sync to Zoho attendance every 5 minutes."
        actions={
          <Badge tone={unmapped.length ? 'warn' : 'ok'}>
            {mappings.length} mapped
          </Badge>
        }
      />

      {msg && (
        <div
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${msgClasses[msg.tone]}`}
        >
          <span>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            className="focus-ring rounded-md px-2 py-0.5 text-xs font-semibold underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---- add / update mapping ---- */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title="Add or update a mapping"
          subtitle="A Zoho Employee ID or an email is required"
        />
        <div className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="RFID UID">
              <input
                placeholder="A1B2C3D4"
                value={draft.uid}
                onChange={(e) => setDraft({ ...draft, uid: e.target.value })}
                className="field font-mono uppercase"
              />
            </Field>
            <Field label="Zoho employee ID">
              <input
                placeholder="123456"
                value={draft.zoho_emp_id ?? ''}
                onChange={(e) => setDraft({ ...draft, zoho_emp_id: e.target.value })}
                className="field"
              />
            </Field>
            <Field label="Email (fallback)">
              <input
                placeholder="name@company.com"
                value={draft.email ?? ''}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="field"
              />
            </Field>
            <Field label="Full name">
              <input
                placeholder="Display name"
                value={draft.full_name ?? ''}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                className="field"
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={save}
              loading={saving}
              disabled={!draft.uid.trim()}
              icon={<IconCheck className="h-4 w-4" />}
            >
              Save mapping
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- unmapped cards ---- */}
      {unmapped.length > 0 && (
        <Card className="mb-6 border-warn/30 bg-warn-soft p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-warn">
            {unmapped.length} whitelisted card{unmapped.length === 1 ? '' : 's'} with no Zoho
            mapping
          </h2>
          <p className="mt-1 text-xs text-warn/90">
            These open the door but won&apos;t record attendance unless the employee&apos;s
            Mapper ID in Zoho equals the UID. Tap one to fill the form above.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unmapped.map((u) => (
              <button
                key={u}
                onClick={() => {
                  setDraft({ ...draft, uid: u })
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="focus-ring rounded-lg border border-warn/30 bg-surface px-2.5 py-1.5 font-mono text-xs font-medium text-ink transition hover:border-warn hover:bg-elevated"
              >
                {u}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ---- existing mappings ---- */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Mapped employees" subtitle={`${mappings.length} cards linked`} />

        {mappings.length === 0 ? (
          <EmptyState
            icon={<IconLink />}
            title="No mappings yet"
            description="Link a card UID to a Zoho employee above to start syncing attendance."
          />
        ) : (
          <>
            {/* mobile */}
            <ul className="divide-y divide-line md:hidden">
              {mappings.map((m) => (
                <li key={m.uid} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{m.full_name || '—'}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{m.uid}</p>
                    <p className="mt-0.5 truncate text-xs text-subtle">
                      {m.zoho_emp_id || m.email || 'Mapper ID fallback'}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(m.uid)}
                    title="Remove mapping"
                    className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-danger-soft hover:text-danger"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            {/* desktop */}
            <div className="hidden md:block">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>UID</Th>
                    <Th>Employee</Th>
                    <Th>Zoho ID</Th>
                    <Th>Email</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <Tr key={m.uid}>
                      <Td className="font-mono text-sm">{m.uid}</Td>
                      <Td className="font-medium">{m.full_name || '—'}</Td>
                      <Td className="text-sm text-muted">{m.zoho_emp_id || '—'}</Td>
                      <Td className="text-sm text-muted">{m.email || '—'}</Td>
                      <Td align="right">
                        <button
                          onClick={() => remove(m.uid)}
                          title="Remove mapping"
                          className="focus-ring ml-auto grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-danger-soft hover:text-danger"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      {/* ---- recent sync ---- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Recent attendance sync"
          subtitle="Last 25 taps pushed to Zoho"
          actions={<IconSync className="h-4 w-4 text-subtle" />}
        />

        {recent.length === 0 ? (
          <EmptyState
            icon={<IconActivity />}
            title="Nothing synced yet"
            description="Taps appear here once cards are scanned and the sync job runs."
          />
        ) : (
          <>
            {/* mobile */}
            <ul className="divide-y divide-line md:hidden">
              {recent.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{r.employee}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{r.uid}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {relativeTime(r.logged_at)}
                      {r.zoho_direction && ` · ${r.zoho_direction}`}
                    </p>
                  </div>
                  <Badge tone={statusTone(r.zoho_status)}>
                    {r.zoho_status || 'pending'}
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
                    <Th>Employee</Th>
                    <Th>UID</Th>
                    <Th>Direction</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <div className="text-sm">{dateTime(r.logged_at)}</div>
                        <div className="text-xs text-subtle">
                          {relativeTime(r.logged_at)}
                        </div>
                      </Td>
                      <Td className="font-medium">{r.employee}</Td>
                      <Td className="font-mono text-sm">{r.uid}</Td>
                      <Td className="text-sm text-muted">{r.zoho_direction || '—'}</Td>
                      <Td align="right">
                        <Badge tone={statusTone(r.zoho_status)}>
                          {r.zoho_status || 'pending'}
                        </Badge>
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
