'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import { Spinner, cx } from '@/components/ui'
import {
  IconChip,
  IconUsers,
  IconCalendar,
  IconKey,
  IconSync,
  IconLock,
  IconSignOut,
} from '@/components/icons'

const NAV = [
  { href: '/devices', label: 'Devices', Icon: IconChip },
  { href: '/employees', label: 'Employees', Icon: IconUsers },
  { href: '/attendance', label: 'Attendance', Icon: IconCalendar },
  { href: '/keys', label: 'Keys', Icon: IconKey },
  { href: '/zoho', label: 'Zoho', Icon: IconSync },
]

/**
 * Auth guard + navigation chrome for all admin pages.
 * Redirects to /login when there is no Supabase session.
 * (Real enforcement is RLS in the database; this is the UX layer.)
 *
 * Desktop gets a pill nav in the header; mobile gets an app-style bottom bar.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login')
      } else {
        setEmail(data.session.user.email ?? null)
        setReady(true)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => sub.subscription.unsubscribe()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-7 w-7 text-brand" />
        <p className="text-sm">Checking session…</p>
      </div>
    )
  }

  const isActive = (href: string) => pathname?.startsWith(href)

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/65">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          {/* brand */}
          <Link
            href="/devices"
            className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-1"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-white shadow-sm dark:text-[rgb(var(--c-canvas))]">
              <IconLock className="h-[18px] w-[18px]" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight text-ink">
                EM Lock
              </span>
              <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-widest text-subtle sm:block">
                Access control
              </span>
            </span>
          </Link>

          {/* desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cx(
                  'focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive(href)
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted hover:bg-elevated hover:text-ink',
                )}
              >
                <Icon className="h-[17px] w-[17px]" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {email && (
              <span className="hidden max-w-[16ch] truncate text-xs text-subtle lg:block">
                {email}
              </span>
            )}
            <ThemeToggle />
            <button
              onClick={signOut}
              title="Sign out"
              className="focus-ring flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-sm font-medium text-muted transition hover:border-danger/40 hover:bg-danger-soft hover:text-danger sm:px-3"
            >
              <IconSignOut className="h-[17px] w-[17px]" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- page ---------------- */}
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>

      {/* ---------------- mobile bottom bar ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cx(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition',
                isActive(href) ? 'text-brand' : 'text-subtle active:text-ink',
              )}
            >
              <span
                className={cx(
                  'grid h-7 w-12 place-items-center rounded-full transition',
                  isActive(href) && 'bg-brand-soft',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
