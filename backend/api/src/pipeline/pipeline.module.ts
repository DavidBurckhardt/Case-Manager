import { Module } from '@nestjs/common'
import { LlmModule } from '../llm/llm.module'
import { DeadlinesModule } from '../deadlines/deadlines.module'
import { LifecycleModule } from '../lifecycle/lifecycle.module'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [LlmModule, DeadlinesModule, LifecycleModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
