'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Scale } from 'lucide-react'
import { NAV_GROUPS, type NavItem, type Role } from '@/constants/navigation'
import { cn } from '@/lib/utils'

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <item.icon
        className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-accent-foreground')}
        aria-hidden="true"
      />
      {item.label}
      {item.badge && (
        <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
          {item.badge}
        </span>
      )}
    </Link>
  )
}

interface SidebarProps {
  userRole?: string
}

export function Sidebar({ userRole }: SidebarProps) {
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.roles || (userRole != null && item.roles.includes(userRole as Role))
    ),
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-background">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Scale className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="text-sm font-semibold leading-tight">
          Generador de<br />Expedientes
        </span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Navegación principal">
        {visibleGroups.map((group, i) => (
          <div key={i} className="space-y-1">
            {group.label && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
