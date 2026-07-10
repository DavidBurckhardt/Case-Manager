import { Module } from '@nestjs/common'
import { LlmModule } from '../llm/llm.module'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [LlmModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
