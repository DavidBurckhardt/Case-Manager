import { Module } from '@nestjs/common'
import { PipelineModule } from '../pipeline/pipeline.module'
import { AuthModule } from '../auth/auth.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'

@Module({
  imports: [PipelineModule, AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
