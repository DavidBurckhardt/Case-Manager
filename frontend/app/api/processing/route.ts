import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, handleError } from '@/lib/api/response'
import { ApiError } from '@/services/case-file.service'

/**
 * GET /api/processing
 *
 * Returns documents with their real pipeline status (updated by the
 * pipeline.service.ts worker, not by a time simulation).
 *
 * Query params:
 *   limit            – max rows (default 50)
 *   include_terminal – 'false' to exclude COMPLETED/ERROR (default: include)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new ApiError('Unauthorized', 401)

    const sp = request.nextUrl.searchParams
    const limit           = Math.min(Number(sp.get('limit') ?? 50), 200)
    const includeTerminal = sp.get('include_terminal') !== 'false'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    let query = db
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
        case_file:case_files ( id, case_number, caption )
      `)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .limit(limit)

    if (!includeTerminal) {
      query = query.not('processing_status', 'in', '("COMPLETED","ERROR")')
    }

    const { data, error } = await query
    if (error) throw new ApiError(error.message)

    return ok(data ?? [])
  } catch (err) {
    return handleError(err)
  }
}
