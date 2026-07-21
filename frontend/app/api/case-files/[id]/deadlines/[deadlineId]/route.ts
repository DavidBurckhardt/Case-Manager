import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, handleError } from '@/lib/api/response'
import { ApiError } from '@/services/case-file.service'

type Params = { params: Promise<{ id: string; deadlineId: string }> }

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { id: caseId, deadlineId } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new ApiError('Unauthorized', 401)

    // Verify user has access to the case via RLS
    const db = supabase as any
    const { data: caseFile } = await db
      .from('case_files')
      .select('id')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!caseFile) throw new ApiError('Case file not found.', 404)

    const admin = createAdminClient() as any
    const { error } = await admin
      .from('case_deadlines')
      .update({
        estado: 'CUMPLIDO',
        is_auto_generated: false,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      })
      .eq('id', deadlineId)
      .eq('case_file_id', caseId)

    if (error) throw new ApiError(error.message)

    return ok({ updated: true })
  } catch (err) {
    return handleError(err)
  }
}
