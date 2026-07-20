import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/constants/roles'
import type { Role } from '@/constants/roles'
export { ROLES, ROLE_LABELS } from '@/constants/roles'
export type { Role } from '@/constants/roles'

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: Role
  is_active: boolean
  created_at: string
}

/** Rol del usuario autenticado, o null si no hay sesión. */
export async function getCurrentUserRole(): Promise<Role | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = (data as { role?: string } | null)?.role
  return role && (ROLES as readonly string[]).includes(role) ? (role as Role) : null
}

/**
 * Usuarios del estudio. La política RLS de public.users solo devuelve la lista
 * completa a admin y socio; un asociado recibe únicamente su propia fila.
 */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('users')
    .select('id, email, full_name, role, is_active, created_at')
    .is('deleted_at', null)
    .order('email', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserRow[]
}
