import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AlertsService } from './alerts.service'

@Injectable()
export class DeadlinesCronService {
  private readonly logger = new Logger(DeadlinesCronService.name)

  constructor(private readonly alerts: AlertsService) {}

  /** 8:00, lunes a viernes — los plazos judiciales solo corren en días hábiles. */
  @Cron('0 8 * * 1-5')
  async handleDailyAlerts(): Promise<void> {
    this.logger.log('Corriendo chequeo diario de alertas de plazos')

    // El barrido de caducidad va PRIMERO: puede abrir plazos nuevos, y así
    // entran en la corrida de alertas de hoy en vez de esperar a mañana.
    await this.alerts.checkPassiveCaducidad()
    await this.alerts.runDailyCheck()
  }
}
