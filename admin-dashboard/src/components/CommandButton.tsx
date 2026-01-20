'use client'

import { useState, useEffect } from 'react'
import type { Command, CommandStatus } from '@/lib/types'

interface CommandButtonProps {
  label: string
  onClick: () => Promise<Command>
  onComplete?: (success: boolean) => void
  className?: string
  variant?: 'primary' | 'danger' | 'secondary'
  disabled?: boolean
}

export default function CommandButton({
  label,
  onClick,
  onComplete,
  className = '',
  variant = 'primary',
  disabled = false,
}: CommandButtonProps) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle')
  const [commandId, setCommandId] = useState<string | null>(null)

  // Poll command status
  useEffect(() => {
    if (!commandId || status === 'done' || status === 'failed') return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/commands/${commandId}`)
        const command: Command = await response.json()

        if (command.status === 'DONE') {
          setStatus('done')
          onComplete?.(true)
          setTimeout(() => setStatus('idle'), 2000)
        } else if (command.status === 'FAILED') {
          setStatus('failed')
          onComplete?.(false)
          setTimeout(() => setStatus('idle'), 3000)
        }
      } catch (error) {
        console.error('Failed to poll command status:', error)
      }
    }, 1000)

    return () => clearInterval(pollInterval)
  }, [commandId, status, onComplete])

  const handleClick = async () => {
    if (status === 'pending') return

    setStatus('pending')
    try {
      const command = await onClick()
      setCommandId(command.id)
    } catch (error) {
      console.error('Command failed:', error)
      setStatus('failed')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const isDisabled = disabled || status === 'pending'

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
  }

  const statusClasses = {
    idle: '',
    pending: 'opacity-50 cursor-wait',
    done: 'bg-green-600 hover:bg-green-600',
    failed: 'bg-red-600 hover:bg-red-600',
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        px-4 py-2 rounded font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${statusClasses[status]}
        ${className}
      `}
    >
      {status === 'pending' && '⏳ '}
      {status === 'done' && '✓ '}
      {status === 'failed' && '✗ '}
      {label}
    </button>
  )
}
