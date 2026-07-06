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
    setMessage('Sending unlock command...')

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
        setMessage('Door unlocked!')
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
      setMessage('Network error - check connection')
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

  const getButtonColor = () => {
    switch (state) {
      case 'unlocking':
        return 'bg-yellow-500'
      case 'success':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-blue-600 active:bg-blue-700'
    }
  }

  const getIcon = () => {
    switch (state) {
      case 'unlocking':
        return (
          <svg className="w-24 h-24 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )
      case 'success':
        return (
          <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      default:
        return (
          <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )
    }
  }

  // ---- First-time setup: ask for the unlock key (saved on this phone) ----
  if (keyLoaded && !unlockKey) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <div className="text-white text-2xl font-bold mb-2">🔑 One-time setup</div>
        <p className="text-gray-400 text-sm text-center mb-6 max-w-xs">
          Enter the unlock key you received from the admin. It is saved on this
          phone — you won&apos;t be asked again.
        </p>
        <form onSubmit={saveKey} className="w-full max-w-xs">
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ulk_..."
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-lg px-4 py-3 mb-3 font-mono text-sm bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!keyInput.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium py-3 rounded-lg"
          >
            Save key
          </button>
        </form>
        <div className="mt-8 text-gray-500 text-xs">Device: {deviceId}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 select-none">
      {/* Status bar safe area */}
      <div className="fixed top-0 left-0 right-0 h-12 bg-gray-900" />

      {/* Main unlock button */}
      <button
        onClick={handleUnlock}
        disabled={state === 'unlocking'}
        className={`
          w-64 h-64 rounded-full
          flex flex-col items-center justify-center
          text-white font-bold text-xl
          transition-all duration-200
          shadow-2xl
          ${getButtonColor()}
          ${state === 'idle' ? 'hover:scale-105' : ''}
          disabled:cursor-not-allowed
        `}
      >
        {getIcon()}
        <span className="mt-4 text-lg">
          {state === 'idle' && 'TAP TO UNLOCK'}
          {state === 'unlocking' && 'UNLOCKING...'}
          {state === 'success' && 'UNLOCKED!'}
          {state === 'error' && 'FAILED'}
        </span>
      </button>

      {/* Device ID */}
      <div className="mt-8 text-gray-400 text-sm">Device: {deviceId}</div>

      {/* Message */}
      {message && (
        <div
          className={`mt-4 px-4 py-2 rounded-lg ${
            state === 'success'
              ? 'bg-green-900 text-green-200'
              : state === 'error'
              ? 'bg-red-900 text-red-200'
              : 'bg-gray-800 text-gray-200'
          }`}
        >
          {message}
        </div>
      )}

      {/* Last unlock time */}
      {lastUnlock && (
        <div className="mt-4 text-gray-500 text-xs">
          Last unlock: {lastUnlock.toLocaleTimeString()}
        </div>
      )}

      {/* Change key */}
      <button
        onClick={() => {
          localStorage.removeItem(KEY_STORAGE)
          setUnlockKey(null)
        }}
        className="fixed bottom-8 text-gray-600 text-xs underline"
      >
        Change unlock key
      </button>
    </div>
  )
}
