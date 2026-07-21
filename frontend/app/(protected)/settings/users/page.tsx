import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/shared/empty-state'
import { UserRoleSelect } from '@/components/settings/user-role-select'
import { getCurrentUserRole, listUsers, ROLE_LABELS } from '@/services/users.service'

export const dynamic = 'force-dynamic'

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default async function UsersSettingsPage() {
  const actorRole = await getCurrentUserRole()

  if (actorRole !== 'admin' && actorRole !== 'socio') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Sin acceso"
        description="La gestión de usuarios está disponible solo para socios y administradores."
      />
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const users = await listUsers()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usuarios del estudio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Un <strong>socio</strong> ve todos los expedientes del estudio. Un{' '}
          <strong>asociado</strong> ve solo aquellos donde es responsable o los que creó.
          {actorRole === 'socio' && ' Solo un admin puede otorgar o revocar el rol admin.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Usuario</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Alta</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rol</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? undefined : 'opacity-60'}>
                <td className="px-4 py-3 font-medium">
                  {u.full_name ?? '—'}
                  {!u.is_active && (
                    <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <UserRoleSelect
                    userId={u.id}
                    role={u.role}
                    actorRole={actorRole}
                    isSelf={u.id === user?.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Roles disponibles: {Object.values(ROLE_LABELS).join(' · ')}. Nadie puede cambiar su propio rol.
      </p>
    </div>
  )
}
