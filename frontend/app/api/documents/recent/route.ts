import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, handleError } from '@/lib/api/response'
import { ApiError } from '@/services/case-file.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new ApiError('Unauthorized', 401)

    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('case_file_documents')
      .select(`
        id, original_filename, file_extension, file_size, mime_type,
        processing_status, origin, uploaded_at,
        case_file:case_files(id, case_number, caption)
      `)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .limit(limit)

    if (error) throw new ApiError(error.message)

    return ok(data ?? [])
  } catch (err) {
    return handleError(err)
  }
}
