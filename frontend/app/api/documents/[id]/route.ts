import { type NextRequest } from 'next/server'
import { getCaseFileDocument, deleteCaseFileDocument } from '@/services/document.service'
import { ok, handleError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const withUrl = request.nextUrl.searchParams.get('download') === 'true'
    const document = await getCaseFileDocument(id, withUrl)
    return ok(document)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await deleteCaseFileDocument(id)
    return ok({ deleted: true })
  } catch (err) {
    return handleError(err)
  }
}
