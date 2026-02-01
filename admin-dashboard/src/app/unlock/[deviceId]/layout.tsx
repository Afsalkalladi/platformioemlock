import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Quick Unlock',
  description: 'Quick unlock your door',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Door Unlock',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#111827',
}

export default function UnlockLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
