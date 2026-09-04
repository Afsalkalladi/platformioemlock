'use client'

import { useState, useEffect } from 'react'
import type { Command } from '@/lib/types'
import { Button, cx, type ButtonSize, type ButtonVariant } from '@/components/ui'
import { IconCheck, IconClose } from '@/components/icons'

interface CommandButtonProps {
  label: string
  onClick: () => Promise<Command>
  onComplete?: (success: boolean) => void
  className?: string
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: React.ReactNode
  disabled?: boolean
}

/**
 * Fires a device command and then polls it to completion, reflecting
 * pending / done / failed inline on the button itself.
 */
export default function CommandButton({
  label,
  onClick,
  onComplete,
  className = '',
  variant = 'primary',
  size = 'md',
  icon,
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

  const resultTone =
    status === 'done'
      ? '!bg-ok !text-white dark:!text-[rgb(var(--c-canvas))]'
      : status === 'failed'
        ? '!bg-danger !text-white dark:!text-[rgb(var(--c-canvas))]'
        : ''

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      loading={status === 'pending'}
      variant={variant}
      size={size}
      icon={
        status === 'done' ? (
          <IconCheck className={iconSize} />
        ) : status === 'failed' ? (
          <IconClose className={iconSize} />
        ) : (
          icon
        )
      }
      className={cx(resultTone, className)}
    >
      {status === 'done' ? 'Done' : status === 'failed' ? 'Failed' : label}
    </Button>
  )
}
