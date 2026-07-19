import { Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { SupabaseService } from '../supabase/supabase.service'
import { AlertsService } from './alerts.service'

@Controller('deadlines')
@UseGuards(SupabaseAuthGuard)
export class DeadlinesController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * POST /deadlines/alerts/run — dispara el chequeo de alertas a demanda.
   * Existe para poder probar el cron sin esperar a la corrida de las 8am.
   */
  @Post('alerts/run')
  async runAlerts(@CurrentUser() user: AuthUser) {
    await this.assertAdmin(user.id)
    return this.alerts.runDailyCheck()
  }

  private async assertAdmin(userId: string): Promise<void> {
    const { data, error } = await this.supabase.admin
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (error || data?.role !== 'admin') {
      throw new ForbiddenException('Admin role required')
    }
  }
}
