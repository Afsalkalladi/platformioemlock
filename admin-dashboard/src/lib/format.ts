/** Shared formatting helpers so dates/sizes read the same on every page. */

export function relativeTime(input: string | number | Date | null): string {
  if (!input) return '—'
  const then = input instanceof Date ? input : new Date(input)
  const secs = Math.round((Date.now() - then.getTime()) / 1000)
  if (!Number.isFinite(secs)) return '—'
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return then.toLocaleDateString()
}

export function dateTime(input: string | number | Date | null): string {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function clockTime(input: string | number | Date | null): string {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A'
  if (value > 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

export function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
