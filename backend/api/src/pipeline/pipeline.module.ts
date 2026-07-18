import { Module } from '@nestjs/common'
import { LlmModule } from '../llm/llm.module'
import { DeadlinesModule } from '../deadlines/deadlines.module'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [LlmModule, DeadlinesModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
