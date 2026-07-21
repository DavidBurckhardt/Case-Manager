import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DeadlinesController } from './deadlines.controller'
import { DeadlinesService } from './deadlines.service'
import { AlertsService } from './alerts.service'
import { HolidaysService } from './holidays.service'
import { DeadlinesCronService } from './deadlines-cron.service'

@Module({
  imports: [AuthModule],
  controllers: [DeadlinesController],
  providers: [DeadlinesService, AlertsService, HolidaysService, DeadlinesCronService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
