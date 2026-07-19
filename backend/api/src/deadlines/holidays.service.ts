import { Injectable, Logger } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

/**
 * Carga y cachea los feriados judiciales por año.
 * Compartido por el motor de plazos y el cron de alertas — ambos necesitan
 * el mismo set de fechas para contar días hábiles.
 */
@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name)
  private readonly cache = new Map<number, Set<string>>()

  constructor(private readonly supabase: SupabaseService) {}

  /** Bound para pasar directo a addBusinessDays / businessDaysUntil. */
  readonly forYear = async (year: number): Promise<Set<string>> => {
    if (this.cache.has(year)) return this.cache.get(year)!

    const { data, error } = await this.supabase.admin
      .from('judicial_holidays')
      .select('date')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)

    if (error) {
      this.logger.error(`Failed to load holidays for year ${year}: ${error.message}`)
      return new Set()
    }

    const set = new Set<string>((data as { date: string }[]).map((r) => r.date))
    this.cache.set(year, set)
    return set
  }
}
