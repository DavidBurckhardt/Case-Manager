import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { SupabaseService } from '../supabase/supabase.service'
import { extractedCaseSchema } from '../llm/extraction.schema'
import { CPCCN_RULES } from './cpccn-rules'
import { addBusinessDays } from './business-days'

type ProceduralAct = z.infer<typeof extractedCaseSchema>['procedural_acts'][number]

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name)
  private readonly holidayCache = new Map<number, Set<string>>()

  constructor(private readonly supabase: SupabaseService) {}

  private get db(): any {
    return this.supabase.admin
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
            this.getHolidaysForYear.bind(this),
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

  private async getHolidaysForYear(year: number): Promise<Set<string>> {
    if (this.holidayCache.has(year)) {
      return this.holidayCache.get(year)!
    }

    const { data, error } = await this.db
      .from('judicial_holidays')
      .select('date')
      .filter('date', 'gte', `${year}-01-01`)
      .filter('date', 'lte', `${year}-12-31`)

    if (error) {
      this.logger.error(`Failed to load holidays for year ${year}: ${error.message}`)
      return new Set()
    }

    const set = new Set<string>((data as { date: string }[]).map((r) => r.date))
    this.holidayCache.set(year, set)
    return set
  }
}
