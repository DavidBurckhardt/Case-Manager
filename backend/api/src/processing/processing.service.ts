import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

@Injectable()
export class ProcessingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProcessingService.name)

  constructor(private readonly supabase: SupabaseService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  /** Reset cases stuck in 'analyzing' (e.g. an API restart mid-batch) back to 'preview'. */
  async onApplicationBootstrap() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data, error } = await this.db
      .from('case_files')
      .update({ processing_phase: 'preview' })
      .eq('processing_phase', 'analyzing')
      .lt('updated_at', cutoff)
      .select('id')
    if (error) this.logger.error(`Orphan recovery failed: ${error.message}`)
    else if (data?.length) this.logger.log(`Reset ${data.length} orphaned analyzing case(s) → preview`)
  }

  async listDocuments(limit: number, includeTerminal: boolean) {
    let query = this.db
      .from('case_file_documents')
      .select(`
        id,
        original_filename,
        file_extension,
        file_size,
        processing_status,
        processing_error,
        processing_error_stage,
        processing_stage_updated_at,
        uploaded_at,
        case_file:case_files ( id, case_number, caption, processing_phase, phase2_docs_total, phase2_docs_completed )
      `)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .limit(limit)

    if (!includeTerminal) {
      query = query.not('processing_status', 'in', '("COMPLETED","ERROR")')
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  }
}
