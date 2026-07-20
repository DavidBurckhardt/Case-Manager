import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

/**
 * Réplica en TypeScript de can_access_case() (migración 23): creador, abogado
 * responsable, o rol con alcance de estudio (admin/socio).
 *
 * Existe porque los servicios del API usan el cliente service_role, que saltea
 * RLS: la regla de la base no se aplica sola, hay que evaluarla a mano. Vive en
 * un solo lugar para que las dos definiciones no se separen con el tiempo.
 */
@Injectable()
export class CaseAccessService {
  constructor(private readonly supabase: SupabaseService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  /** Lanza 404 si el expediente no existe y 403 si el usuario no tiene acceso. */
  async assert(caseId: string, userId: string): Promise<void> {
    const { data: caseFile, error } = await this.db
      .from('case_files')
      .select('created_by, responsible_attorney_id')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !caseFile) throw new NotFoundException('Expediente no encontrado')

    if (caseFile.created_by === userId || caseFile.responsible_attorney_id === userId) return

    const { data: me } = await this.db.from('users').select('role').eq('id', userId).maybeSingle()
    if (me?.role === 'admin' || me?.role === 'socio') return

    throw new ForbiddenException('Sin acceso a este expediente')
  }
}
