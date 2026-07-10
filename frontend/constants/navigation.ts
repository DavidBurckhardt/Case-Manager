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
      { label: 'Panel', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Trabajo',
    items: [
      { label: 'Expedientes',    href: '/cases',         icon: FolderOpen },
      { label: 'Procesamiento',  href: '/processing',    icon: Cpu },
      { label: 'Vencimientos',   href: '/deadlines',     icon: Clock },
      { label: 'Documentos',     href: '/documents',     icon: FileText },
      { label: 'Notificaciones', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Administración', href: '/admin', icon: Settings, requiredRole: 'admin' },
    ],
  },
]
