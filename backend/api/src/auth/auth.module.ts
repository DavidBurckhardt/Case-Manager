import { Module } from '@nestjs/common'
import { SupabaseAuthGuard } from './supabase-auth.guard'
import { CaseAccessService } from './case-access.service'

@Module({
  providers: [SupabaseAuthGuard, CaseAccessService],
  exports: [SupabaseAuthGuard, CaseAccessService],
})
export class AuthModule {}
