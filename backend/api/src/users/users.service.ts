import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

export const ROLES = ['admin', 'socio', 'asociado'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(private readonly supabase: SupabaseService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  async getRole(userId: string): Promise<Role | null> {
    const { data, error } = await this.db
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new Error(`Failed to read role: ${error.message}`)
    const role = data?.role
    return role && isRole(role) ? role : null
  }

  /**
   * Cambia el rol de un usuario.
   *
   * Reglas:
   *  - solo admin y socio pueden cambiar roles
   *  - solo un admin puede otorgar o revocar el rol admin — un socio que
   *    pudiera promover a admin podría auto-promoverse por interpósita persona
   *  - nadie puede cambiar su propio rol: evita que el último admin se degrade
   *    y deje al estudio sin nadie que gestione usuarios
   */
  async changeRole(actorId: string, targetId: string, nextRole: string): Promise<{ id: string; role: Role }> {
    if (!isRole(nextRole)) {
      throw new BadRequestException(`Rol inválido: ${nextRole}. Válidos: ${ROLES.join(', ')}`)
    }

    const actorRole = await this.getRole(actorId)
    if (actorRole !== 'admin' && actorRole !== 'socio') {
      throw new ForbiddenException('Solo admin o socio pueden cambiar roles')
    }

    if (actorId === targetId) {
      throw new ForbiddenException('No podés cambiar tu propio rol')
    }

    const targetRole = await this.getRole(targetId)
    if (targetRole === null) {
      throw new NotFoundException(`Usuario ${targetId} no encontrado`)
    }

    // Otorgar o revocar admin es privilegio exclusivo de un admin.
    if (actorRole === 'socio' && (nextRole === 'admin' || targetRole === 'admin')) {
      throw new ForbiddenException('Solo un admin puede otorgar o revocar el rol admin')
    }

    const { data, error } = await this.db
      .from('users')
      .update({ role: nextRole })
      .eq('id', targetId)
      .select('id, role')
      .single()

    if (error || !data) throw new Error(`Failed to update role: ${error?.message}`)

    this.logger.log(`Rol cambiado — usuario ${targetId}: ${targetRole} → ${nextRole} (por ${actorId})`)
    return data as { id: string; role: Role }
  }
}
