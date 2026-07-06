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
  const [freshKey, setFreshKey] = useState<{ label: string; plaintext: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    load()
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
    if (!confirm(`Revoke "${key.label}"? Their widget will stop working immediately.`)) return
    await revokeUnlockKey(key.id)
    await load()
  }

  async function handleRegenerate(key: UnlockKey) {
    if (!confirm(`Regenerate "${key.label}"? The old key stops working and they must enter the new one.`)) return
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
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Unlock Keys</h1>
        <p className="text-gray-600 mb-6">
          Give a key to each person who needs widget unlock. They enter it once while
          setting up their iOS Shortcut / Android widget. Revoke it here to cut access instantly.
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Freshly created key - shown ONCE */}
        {freshKey && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <div className="font-semibold text-yellow-800 mb-1">
              Key for “{freshKey.label}” — copy it now, it will not be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-white border rounded px-3 py-2 font-mono text-sm flex-1 break-all">
                {freshKey.plaintext}
              </code>
              <button
                onClick={copyKey}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded font-medium whitespace-nowrap"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-sm text-yellow-700 mt-3">
              <div className="font-medium mb-1">Widget setup (share this with them):</div>
              <div>
                URL: <code className="bg-white px-1 rounded">https://YOUR-DOMAIN/api/unlock/DEVICE_ID?key={freshKey.plaintext}</code>, Method: POST
              </div>
              <div className="mt-1">
                Or open <code className="bg-white px-1 rounded">https://YOUR-DOMAIN/unlock/DEVICE_ID</code> once,
                enter the key when asked, then “Add to Home Screen” — the key is remembered.
              </div>
            </div>
            <button
              onClick={() => setFreshKey(null)}
              className="text-sm text-yellow-700 underline mt-2"
            >
              Done, hide key
            </button>
          </div>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Label, e.g. "Rahul – phone"'
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={busy || !label.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium"
          >
            Generate key
          </button>
        </form>

        {/* Key list */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last used</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    No keys yet. Generate one above.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className={k.revoked_at ? 'bg-gray-50 text-gray-400' : ''}>
                  <td className="px-6 py-4 font-medium">{k.label}</td>
                  <td className="px-6 py-4">
                    {k.revoked_at ? (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Revoked
                      </span>
                    ) : (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right text-sm space-x-3">
                    {!k.revoked_at && (
                      <>
                        <button
                          onClick={() => handleRegenerate(k)}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          Regenerate
                        </button>
                        <button
                          onClick={() => handleRevoke(k)}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Revoke
                        </button>
                      </>
                    )}
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
