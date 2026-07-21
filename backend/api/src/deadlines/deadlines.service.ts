import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { SupabaseService } from '../supabase/supabase.service'
import { extractedCaseSchema } from '../llm/extraction.schema'
import { CPCCN_RULES } from './cpccn-rules'
import { addBusinessDays, toDateString } from './business-days'
import { HolidaysService } from './holidays.service'

type ProceduralAct = z.infer<typeof extractedCaseSchema>['procedural_acts'][number]

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name)

  constructor(
    private readonly supabase: SupabaseService,
    private readonly holidays: HolidaysService,
  ) {}

  private get db(): any {
    return this.supabase.admin
  }

  /**
   * Plazos PENDIENTE que vencen dentro de `dias` días corridos, acotados a los
   * expedientes que el usuario puede ver.
   *
   * El backend habla con Supabase por service-role, así que RLS no aplica: el
   * criterio de acceso de can_access_case() (migración 23) se reproduce acá a
   * mano — creador, abogado responsable, o rol con alcance de estudio.
   */
  async countUpcoming(userId: string, dias: number): Promise<number> {
    const until = new Date()
    until.setDate(until.getDate() + dias)
    const untilStr = toDateString(until)

    const caseIds = await this.accessibleCaseIds(userId)
    if (caseIds.length === 0) return 0

    const { count, error } = await this.db
      .from('case_deadlines')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE')
      .lte('fecha_vencimiento', untilStr)
      .in('case_file_id', caseIds)

    if (error) throw new Error(`Failed to count upcoming deadlines: ${error.message}`)
    return count ?? 0
  }

  /**
   * Ids de los expedientes vivos que `userId` puede ver. Se resuelven acá y no
   * con un filtro embebido sobre case_files porque los filtros de PostgREST
   * sobre tablas embebidas son frágiles (mismo motivo que en AlertsService).
   */
  private async accessibleCaseIds(userId: string): Promise<string[]> {
    const { data: profile } = await this.db
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const firmWide = profile?.role === 'admin' || profile?.role === 'socio'

    let q = this.db.from('case_files').select('id').is('deleted_at', null)
    if (!firmWide) {
      q = q.or(`created_by.eq.${userId},responsible_attorney_id.eq.${userId}`)
    }

    const { data, error } = await q
    if (error) throw new Error(`Failed to resolve accessible cases: ${error.message}`)
    return (data ?? []).map((row: { id: string }) => row.id)
  }

  async generateForCase(caseId: string, proceduralActs: ProceduralAct[]): Promise<void> {
    try {
      // 1. Filtrar actos procesables
      const processable = proceduralActs.filter((act) => {
        if (!act.act_type) {
          this.logger.warn(`[${caseId}] Skipping act: act_type is null`)
          return false
        }
        if (act.act_type === 'OTRO') {
          this.logger.warn(`[${caseId}] Skipping act: act_type=OTRO has no rule`)
          return false
        }
        if (!CPCCN_RULES[act.act_type]) {
          this.logger.warn(`[${caseId}] Skipping act: act_type=${act.act_type} has no CPCCN rule`)
          return false
        }
        if (!act.notification_date) {
          this.logger.warn(`[${caseId}] Skipping act: act_type=${act.act_type} has no notification_date`)
          return false
        }
        return true
      })

      if (processable.length === 0) {
        this.logger.log(`[${caseId}] No processable acts — skipping deadline generation`)
        return
      }

      // Deduplicar por (act_type, notification_date) — el LLM puede extraer el mismo acto dos veces
      const seen = new Set<string>()
      const unique = processable.filter((act) => {
        const key = `${act.act_type}|${act.notification_date}`
        if (seen.has(key)) {
          this.logger.warn(`[${caseId}] Duplicate act skipped: ${key}`)
          return false
        }
        seen.add(key)
        return true
      })

      // 2. Borrar plazos auto-generados previos (preserva los manuales con is_auto_generated=false)
      const { error: deleteError } = await this.db
        .from('case_deadlines')
        .delete()
        .eq('case_file_id', caseId)
        .eq('is_auto_generated', true)

      if (deleteError) {
        this.logger.error(`[${caseId}] Failed to delete existing auto deadlines: ${deleteError.message}`)
        return
      }

      // 3. Calcular vencimientos
      const rows = await Promise.all(
        unique.map(async (act) => {
          const rule = CPCCN_RULES[act.act_type!]!
          const fechaVencimiento = await addBusinessDays(
            act.notification_date!,
            rule.diasHabiles,
            this.holidays.forYear,
          )
          return {
            case_file_id:      caseId,
            act_type:          act.act_type,
            description:       rule.description,
            dias_habiles:      rule.diasHabiles,
            fecha_inicio:      act.notification_date,
            fecha_vencimiento: fechaVencimiento,
            estado:            'PENDIENTE',
            tipo:              rule.tipo,
            triggered_by_act:  act,
            is_auto_generated: true,
          }
        }),
      )

      // 4. Insertar en un solo batch
      const { error: insertError } = await this.db.from('case_deadlines').insert(rows)

      if (insertError) {
        this.logger.error(`[${caseId}] Failed to insert deadlines: ${insertError.message}`)
        return
      }

      this.logger.log(`✓ ${rows.length} plazos generados para caso ${caseId}`)
    } catch (err: any) {
      this.logger.error(`[${caseId}] generateForCase threw unexpectedly: ${err?.message ?? err}`)
    }
  }
}
