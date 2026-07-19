import {
  FolderOpen,
  Clock,
  FileText,
  Bell,
  Settings,
  LayoutDashboard,
  Cpu,
  Users,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'admin' | 'socio' | 'asociado'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Roles allowed to see this item. undefined = any authenticated user. */
  roles?: readonly Role[]
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
      { label: 'Procesamiento',  href: '/processing',    icon: Cpu },
      { label: 'Expedientes',    href: '/cases',         icon: FolderOpen },
      { label: 'Documentos',     href: '/documents',     icon: FileText },
      { label: 'Vencimientos',   href: '/deadlines',     icon: Clock },
      { label: 'Notificaciones', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Seguridad',      href: '/settings/security', icon: ShieldCheck },
      { label: 'Usuarios',       href: '/settings/users', icon: Users,    roles: ['admin', 'socio'] },
      { label: 'Administración', href: '/admin',          icon: Settings, roles: ['admin'] },
    ],
  },
]
