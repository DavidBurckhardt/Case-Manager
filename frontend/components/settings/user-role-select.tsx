'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { ROLE_LABELS, type Role } from '@/constants/roles'

interface Props {
  userId: string
  role: Role
  /** Rol de quien está mirando la pantalla — define qué puede otorgar. */
  actorRole: Role
  /** El usuario de la fila es uno mismo: nadie puede cambiar su propio rol. */
  isSelf: boolean
}

export function UserRoleSelect({ userId, role, actorRole, isSelf }: Props) {
  const router = useRouter()
  const [value, setValue] = useState<Role>(role)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo un admin puede otorgar o revocar admin. El backend valida lo mismo:
  // esto es únicamente para no ofrecer una opción que va a ser rechazada.
  const canEdit = !isSelf && (actorRole === 'admin' || role !== 'admin')
  const options: Role[] = actorRole === 'admin'
    ? ['admin', 'socio', 'asociado']
    : ['socio', 'asociado']

  async function onChange(next: Role) {
    const previous = value
    setValue(next)
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? `Error ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setValue(previous)
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol.')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <span className="text-sm text-muted-foreground">
        {ROLE_LABELS[role]}
        {isSelf && <span className="ml-1.5 text-xs">(vos)</span>}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as Role)}
        aria-label={`Rol de ${userId}`}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {options.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
