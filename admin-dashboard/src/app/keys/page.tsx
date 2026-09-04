'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/Shell'
import {
  fetchUnlockKeys,
  createUnlockKey,
  revokeUnlockKey,
  regenerateUnlockKey,
} from '@/lib/api'
import type { UnlockKey } from '@/lib/types'
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
  TableWrap,
  Td,
  Th,
  Tr,
  cx,
} from '@/components/ui'
import { relativeTime, dateTime } from '@/lib/format'
import {
  IconKey,
  IconPlus,
  IconCopy,
  IconCheck,
  IconSync,
  IconBan,
  IconClose,
} from '@/components/icons'

export default function KeysPage() {
  return (
    <Shell>
      <KeysInner />
    </Shell>
  )
}

function KeysInner() {
  const [keys, setKeys] = useState<UnlockKey[]>([])
  const [label, setLabel] = useState('')
  const [freshKey, setFreshKey] = useState<{ label: string; plaintext: string } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('https://YOUR-DOMAIN')

  useEffect(() => {
    load()
    setOrigin(window.location.origin)
  }, [])

  async function load() {
    try {
      setKeys(await fetchUnlockKeys())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    try {
      const { plaintext } = await createUnlockKey(label.trim())
      setFreshKey({ label: label.trim(), plaintext })
      setLabel('')
      setCopied(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(key: UnlockKey) {
    if (!confirm(`Revoke "${key.label}"? Their widget will stop working immediately.`))
      return
    await revokeUnlockKey(key.id)
    await load()
  }

  async function handleRegenerate(key: UnlockKey) {
    if (
      !confirm(
        `Regenerate "${key.label}"? The old key stops working and they must enter the new one.`,
      )
    )
      return
    setBusy(true)
    try {
      const { plaintext } = await regenerateUnlockKey(key.id, key.label)
      setFreshKey({ label: key.label, plaintext })
      setCopied(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function copyKey() {
    if (!freshKey) return
    await navigator.clipboard.writeText(freshKey.plaintext)
    setCopied(true)
  }

  if (loading) {
    return (
      <PageBody width="narrow">
        <PageLoader label="Loading keys…" />
      </PageBody>
    )
  }

  const active = keys.filter((k) => !k.revoked_at)

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="Access"
        title="Unlock keys"
        subtitle="Give one key to each person who needs widget unlock. They enter it once while setting up their iOS Shortcut or Android widget — revoke it here to cut access instantly."
        actions={<Badge tone={active.length ? 'ok' : 'neutral'}>{active.length} active</Badge>}
      />

      {error && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {/* ---- freshly created key, shown once ---- */}
      {freshKey && (
        <Card className="mb-6 animate-scale-in border-warn/40 bg-warn-soft p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-warn">
                Key for “{freshKey.label}”
              </h2>
              <p className="mt-0.5 text-xs text-warn/90">
                Copy it now — it will never be shown again.
              </p>
            </div>
            <button
              onClick={() => setFreshKey(null)}
              title="Hide key"
              className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-warn transition hover:bg-warn/10"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-lg border border-warn/30 bg-surface px-3 py-2.5 font-mono text-xs text-ink">
              {freshKey.plaintext}
            </code>
            <Button
              onClick={copyKey}
              variant={copied ? 'secondary' : 'primary'}
              icon={
                copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />
              }
              className="shrink-0"
            >
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-warn/25 bg-surface/60 p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Widget setup — share this with them</p>
            <p className="break-all">
              <span className="font-medium text-ink">POST</span>{' '}
              <code className="rounded bg-elevated px-1 py-0.5 font-mono">
                {origin}/api/unlock/DEVICE_ID?key={freshKey.plaintext}
              </code>
            </p>
            <p className="break-all">
              Or open{' '}
              <code className="rounded bg-elevated px-1 py-0.5 font-mono">
                {origin}/unlock/DEVICE_ID
              </code>{' '}
              once, enter the key when asked, then “Add to Home Screen” — the key is
              remembered on that phone.
            </p>
          </div>
        </Card>
      )}

      {/* ---- create ---- */}
      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Label, e.g. "Rahul – phone"'
            className="field sm:flex-1"
          />
          <Button
            type="submit"
            disabled={!label.trim()}
            loading={busy}
            icon={<IconPlus className="h-4 w-4" />}
          >
            Generate key
          </Button>
        </form>
      </Card>

      {/* ---- key list ---- */}
      <Card className="overflow-hidden">
        <CardHeader title="Issued keys" subtitle={`${keys.length} total`} />

        {keys.length === 0 ? (
          <EmptyState
            icon={<IconKey />}
            title="No keys yet"
            description="Generate one above and hand it to the person who needs remote unlock."
          />
        ) : (
          <>
            {/* mobile */}
            <ul className="divide-y divide-line md:hidden">
              {keys.map((k) => (
                <li key={k.id} className={cx('p-4', k.revoked_at && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{k.label}</p>
                      <p className="mt-1 text-xs text-subtle">
                        Created {dateTime(k.created_at)}
                        {k.last_used_at && ` · used ${relativeTime(k.last_used_at)}`}
                      </p>
                    </div>
                    <Badge tone={k.revoked_at ? 'danger' : 'ok'}>
                      {k.revoked_at ? 'Revoked' : 'Active'}
                    </Badge>
                  </div>
                  {!k.revoked_at && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRegenerate(k)}
                        icon={<IconSync className="h-3.5 w-3.5" />}
                      >
                        Regenerate
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleRevoke(k)}
                        icon={<IconBan className="h-3.5 w-3.5" />}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* desktop */}
            <div className="hidden md:block">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Label</Th>
                    <Th>Status</Th>
                    <Th>Last used</Th>
                    <Th>Created</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <Tr key={k.id} className={cx(k.revoked_at && 'opacity-60')}>
                      <Td className="font-medium">{k.label}</Td>
                      <Td>
                        <Badge tone={k.revoked_at ? 'danger' : 'ok'}>
                          {k.revoked_at ? 'Revoked' : 'Active'}
                        </Badge>
                      </Td>
                      <Td className="text-sm text-muted">
                        {k.last_used_at ? relativeTime(k.last_used_at) : '—'}
                      </Td>
                      <Td className="text-sm text-muted">
                        {new Date(k.created_at).toLocaleDateString()}
                      </Td>
                      <Td align="right">
                        {!k.revoked_at && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleRegenerate(k)}
                              icon={<IconSync className="h-3.5 w-3.5" />}
                            >
                              Regenerate
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleRevoke(k)}
                              icon={<IconBan className="h-3.5 w-3.5" />}
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
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
