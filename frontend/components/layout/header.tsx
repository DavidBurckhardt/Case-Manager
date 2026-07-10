'use client'

import { Bell, Search } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/actions/auth'
import { useTransition } from 'react'

interface HeaderProps {
  title?: string
  userEmail?: string
}

function getInitials(email?: string) {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

export function Header({ title, userEmail }: HeaderProps) {
  const [pending, startTransition] = useTransition()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      {/* Page title */}
      <h1 className="text-sm font-semibold text-foreground">
        {title ?? 'Panel'}
      </h1>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Search — entry point only; implementation in a future ticket */}
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 text-muted-foreground sm:flex"
          aria-label="Buscar (próximamente)"
          disabled
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Buscar…</span>
          <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-mono lg:inline">
            ⌘K
          </kbd>
        </Button>

        <ThemeToggle />

        {/* Notifications bell */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notificaciones">
          <Bell className="h-4 w-4" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-8 w-8 items-center justify-center rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Menú de usuario"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-[11px] text-primary-foreground">
                {getInitials(userEmail)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">Conectado como</span>
                <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {userEmail}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Perfil</DropdownMenuItem>
            <DropdownMenuItem disabled>Configuración</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={pending}
              onSelect={() => startTransition(() => signOut())}
            >
              {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
