import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { LifecycleController } from './lifecycle.controller'
import { LifecycleService } from './lifecycle.service'

@Module({
  imports: [AuthModule],
  controllers: [LifecycleController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
