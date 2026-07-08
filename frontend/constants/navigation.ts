import {
  FolderOpen,
  Clock,
  FileText,
  Bell,
  Settings,
  LayoutDashboard,
  Cpu,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Minimum role required. undefined = any authenticated user. */
  requiredRole?: 'admin'
  badge?: string
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Cases',         href: '/cases',         icon: FolderOpen },
      { label: 'Processing',    href: '/processing',    icon: Cpu },
      { label: 'Deadlines',     href: '/deadlines',     icon: Clock },
      { label: 'Documents',     href: '/documents',     icon: FileText },
      { label: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Administration', href: '/admin', icon: Settings, requiredRole: 'admin' },
    ],
  },
]
