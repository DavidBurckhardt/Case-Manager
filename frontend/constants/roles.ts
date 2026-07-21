export const ROLES = ['admin', 'socio', 'asociado'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin:    'Admin',
  socio:    'Socio',
  asociado: 'Asociado',
}
