import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { ProcessingService } from './processing.service'

@Controller('processing')
@UseGuards(SupabaseAuthGuard)
export class ProcessingController {
  constructor(private readonly processing: ProcessingService) {}

  /** GET /processing?limit=50&include_terminal=true */
  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('include_terminal') includeTerminal?: string,
  ) {
    const max = Math.min(Number(limit ?? 50) || 50, 200)
    return this.processing.listDocuments(max, includeTerminal !== 'false')
  }
}
