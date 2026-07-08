import { type NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api/response'
import { listCaseFiles } from '@/services/case-file.service'

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('q') ?? undefined
    const result = await listCaseFiles({ page: 1, page_size: 20, search })
    return ok(result.data)
  } catch (err) {
    return handleError(err)
  }
}
