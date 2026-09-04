'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

type UnlockState = 'idle' | 'unlocking' | 'success' | 'error'

const KEY_STORAGE = 'em_lock_unlock_key'

export default function QuickUnlockPage() {
  const params = useParams()
  const deviceId = params.deviceId as string

  const [state, setState] = useState<UnlockState>('idle')
  const [message, setMessage] = useState('')
  const [lastUnlock, setLastUnlock] = useState<Date | null>(null)
  const [unlockKey, setUnlockKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)

  // Load key: URL ?key= takes priority (and is saved), else localStorage.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlKey = urlParams.get('key')
    if (urlKey) {
      localStorage.setItem(KEY_STORAGE, urlKey)
      setUnlockKey(urlKey)
    } else {
      setUnlockKey(localStorage.getItem(KEY_STORAGE))
    }
    setKeyLoaded(true)
  }, [])

  const handleUnlock = useCallback(async () => {
    if (state === 'unlocking') return
    const key = unlockKey ?? localStorage.getItem(KEY_STORAGE)
    if (!key) return

    setState('unlocking')
    setMessage('Sending unlock command…')

    try {
      const response = await fetch(`/api/unlock/${deviceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
      })

      const data = await response.json()

      if (data.success) {
        setState('success')
        setMessage('Door unlocked')
        setLastUnlock(new Date())
        if (navigator.vibrate) navigator.vibrate([100, 50, 100])
        setTimeout(() => {
          setState('idle')
          setMessage('')
        }, 3000)
      } else {
        // Invalid/revoked key -> clear it so the user is asked again
        if (response.status === 401) {
          localStorage.removeItem(KEY_STORAGE)
          setUnlockKey(null)
        }
        setState('error')
        setMessage(data.error || 'Failed to unlock')
        setTimeout(() => {
          setState('idle')
          setMessage('')
        }, 3000)
      }
    } catch {
      setState('error')
      setMessage('Network error — check connection')
      setTimeout(() => {
        setState('idle')
        setMessage('')
      }, 3000)
    }
  }, [deviceId, state, unlockKey])

  // Auto-unlock on page load if URL has ?auto=true (only once key is known)
  useEffect(() => {
    if (!keyLoaded || !unlockKey) return
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('auto') === 'true') {
      handleUnlock()
    }
  }, [keyLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function saveKey(e: React.FormEvent) {
    e.preventDefault()
    const k = keyInput.trim()
    if (!k) return
    localStorage.setItem(KEY_STORAGE, k)
    setUnlockKey(k)
    setKeyInput('')
  }

  /* ---------------- first-time setup ---------------- */
  if (keyLoaded && !unlockKey) {
    return (
      <div className="unlock-stage flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-xs animate-fade-in text-center">
          <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <circle cx="8" cy="15" r="4" />
              <path d="M10.8 12.2 20 3M17 6l2.5 2.5M14.5 8.5 17 11" />
            </svg>
          </span>
          <h1 className="text-xl font-semibold text-white">One-time setup</h1>
          <p className="mx-auto mt-2 text-sm leading-relaxed text-white/60">
            Enter the unlock key you received from the admin. It is saved on this phone —
            you won&apos;t be asked again.
          </p>

          <form onSubmit={saveKey} className="mt-6">
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="ulk_…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={!keyInput.trim()}
              className="mt-3 w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-900 transition active:scale-[.98] disabled:opacity-30"
            >
              Save key
            </button>
          </form>

          <p className="mt-8 font-mono text-xs text-white/35">{deviceId}</p>
        </div>
      </div>
    )
  }

  /* ---------------- unlock button ---------------- */
  const ring =
    state === 'unlocking'
      ? 'from-amber-400 to-orange-500 shadow-[0_0_60px_-10px_rgba(251,191,36,.7)]'
      : state === 'success'
        ? 'from-emerald-400 to-green-600 shadow-[0_0_70px_-10px_rgba(52,211,153,.75)]'
        : state === 'error'
          ? 'from-rose-500 to-red-600 shadow-[0_0_60px_-10px_rgba(244,63,94,.7)]'
          : 'from-indigo-500 to-blue-600 shadow-[0_0_60px_-12px_rgba(99,102,241,.75)]'

  const caption =
    state === 'idle'
      ? 'Tap to unlock'
      : state === 'unlocking'
        ? 'Unlocking…'
        : state === 'success'
          ? 'Unlocked'
          : 'Failed'

  const icon = () => {
    if (state === 'unlocking')
      return (
        <svg className="h-16 w-16 sm:h-20 sm:w-20 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
          <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
        </svg>
      )
    if (state === 'success')
      return (
        <svg className="h-16 w-16 sm:h-20 sm:w-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2.5" />
          <path d="M8 10V7a4 4 0 0 1 7.5-2" />
          <path d="M9.5 15.5 11.5 17.5 15 14" />
        </svg>
      )
    if (state === 'error')
      return (
        <svg className="h-16 w-16 sm:h-20 sm:w-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </svg>
      )
    return (
      <svg className="h-16 w-16 sm:h-20 sm:w-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2" />
      </svg>
    )
  }

  return (
    <div className="unlock-stage flex min-h-[100dvh] select-none flex-col items-center justify-center px-6 py-10">
      <p className="mb-10 font-mono text-xs uppercase tracking-[0.2em] text-white/40">
        {deviceId}
      </p>

      <button
        onClick={handleUnlock}
        disabled={state === 'unlocking'}
        aria-label="Unlock door"
        className="group relative grid h-56 w-56 place-items-center rounded-full transition-transform duration-200 active:scale-95 disabled:cursor-wait xs:h-64 xs:w-64 sm:h-72 sm:w-72"
      >
        {/* halo */}
        <span
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${ring} transition-all duration-500`}
        />
        <span className="absolute inset-[6px] rounded-full bg-white/10 backdrop-blur-sm" />
        <span className="absolute inset-[6px] rounded-full ring-1 ring-inset ring-white/25" />
        {state === 'idle' && (
          <span className="absolute inset-0 animate-ping rounded-full bg-white/5 [animation-duration:3s]" />
        )}

        <span className="relative flex flex-col items-center text-white">
          {icon()}
          <span className="mt-3 text-base font-semibold tracking-wide">{caption}</span>
        </span>
      </button>

      {message && (
        <div className="mt-8 animate-fade-in rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur">
          {message}
        </div>
      )}

      {lastUnlock && (
        <p className="mt-4 text-xs text-white/40">
          Last unlock {lastUnlock.toLocaleTimeString()}
        </p>
      )}

      <button
        onClick={() => {
          localStorage.removeItem(KEY_STORAGE)
          setUnlockKey(null)
        }}
        className="mt-10 pb-[env(safe-area-inset-bottom)] text-xs text-white/35 underline underline-offset-4 transition active:text-white/70"
      >
        Change unlock key
      </button>
    </div>
  )
}
