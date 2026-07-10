import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProcessingController } from './processing.controller'
import { ProcessingService } from './processing.service'

@Module({
  imports: [AuthModule],
  controllers: [ProcessingController],
  providers: [ProcessingService],
})
export class ProcessingModule {}
