'use client'

import { usePathname } from 'next/navigation'
import { NAV_GROUPS } from '@/constants/navigation'

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

/** Derives the page title from the current pathname. */
export function usePageTitle(): string {
  const pathname = usePathname()

  const match = ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  )

  if (match) return match.label

  // Fallback: capitalise the last path segment
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}
