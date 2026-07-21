import { Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { SupabaseService } from '../supabase/supabase.service'
import { AlertsService } from './alerts.service'
import { DeadlinesService } from './deadlines.service'

const DEFAULT_DIAS = 10
const MAX_DIAS = 365

@Controller('deadlines')
@UseGuards(SupabaseAuthGuard)
export class DeadlinesController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly deadlines: DeadlinesService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * GET /deadlines/count?dias=10 — cuántos plazos pendientes vencen en la
   * ventana pedida, acotado a los expedientes visibles para el usuario.
   * Alimenta la stat card "Vencimientos Pendientes" del dashboard.
   */
  @Get('count')
  async count(@CurrentUser() user: AuthUser, @Query('dias') dias?: string) {
    const parsed = Number(dias)
    const ventana = Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), MAX_DIAS)
      : DEFAULT_DIAS

    return { count: await this.deadlines.countUpcoming(user.id, ventana) }
  }

  /**
   * POST /deadlines/alerts/run — dispara el chequeo de alertas a demanda.
   * Existe para poder probar el cron sin esperar a la corrida de las 8am, así
   * que corre exactamente lo mismo y en el mismo orden que handleDailyAlerts.
   */
  @Post('alerts/run')
  async runAlerts(@CurrentUser() user: AuthUser) {
    await this.assertAdmin(user.id)
    const caducidad = await this.alerts.checkPassiveCaducidad()
    const alertas = await this.alerts.runDailyCheck()
    return { ...alertas, caducidad }
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
