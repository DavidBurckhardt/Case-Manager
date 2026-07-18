import { Module } from '@nestjs/common'
import { DeadlinesService } from './deadlines.service'

@Module({
  providers: [DeadlinesService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
