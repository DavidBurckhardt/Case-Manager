import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { HealthController } from './health/health.controller'
import { SupabaseModule } from './supabase/supabase.module'
import { MessagingModule } from './messaging/messaging.module'
import { LlmModule } from './llm/llm.module'
import { PipelineModule } from './pipeline/pipeline.module'
import { DocumentsModule } from './documents/documents.module'
import { ProcessingModule } from './processing/processing.module'
import { AuthModule } from './auth/auth.module'
import { DeadlinesModule } from './deadlines/deadlines.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    MessagingModule,
    LlmModule,
    PipelineModule,
    DocumentsModule,
    ProcessingModule,
    AuthModule,
    DeadlinesModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
