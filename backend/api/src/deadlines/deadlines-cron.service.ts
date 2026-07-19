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
    await this.alerts.runDailyCheck()
  }
}
