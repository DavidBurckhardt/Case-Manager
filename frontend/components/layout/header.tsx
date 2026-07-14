'use client'

import { Bell, LogOut, Search } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { signOut } from '@/actions/auth'
import { useState, useTransition } from 'react'

interface HeaderProps {
  title?: string
  userEmail?: string
}

function getInitials(email?: string) {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

export function Header({ title, userEmail }: HeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
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

        {/* User avatar → sign-out confirmation */}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Menú de usuario"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-[11px] text-primary-foreground">
              {getInitials(userEmail)}
            </AvatarFallback>
          </Avatar>
        </button>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Cerrar sesión?</DialogTitle>
              <DialogDescription>
                {userEmail
                  ? <>Estás conectado como <span className="font-medium text-foreground">{userEmail}</span>. Vas a volver a la pantalla de inicio de sesión.</>
                  : 'Vas a volver a la pantalla de inicio de sesión.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => startTransition(() => signOut())}
              >
                <LogOut className="h-4 w-4" />
                {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  )
}
