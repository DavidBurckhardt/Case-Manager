import { type NextRequest } from 'next/server'
import { uploadCaseFileDocument, listCaseFileDocuments } from '@/services/document.service'
import { ok, handleError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const documents = await listCaseFileDocuments(id)
    return ok(documents)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: caseFileId } = await params
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    console.log(`[api/case-files/documents] caseFileId=${caseFileId} received ${files.length} file(s): ${files.map((f) => f.name).join(', ')}`)

    if (!files.length) {
      return ok({ error: 'No files provided.' }, 422)
    }

    const results = await Promise.allSettled(
      files.map((file) => uploadCaseFileDocument(caseFileId, file))
    )

    const documents = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof uploadCaseFileDocument>>> =>
        r.status === 'fulfilled'
      )
      .map((r) => r.value)

    const errors = results
      .filter((r, i): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, i) => ({ file: files[i]?.name ?? 'unknown', error: String(r.reason?.message ?? r.reason) }))

    if (errors.length) {
      console.error(`[api/case-files/documents] caseFileId=${caseFileId} ${errors.length}/${files.length} file(s) failed:`, errors)
    }
    console.log(`[api/case-files/documents] result — uploaded=${documents.length} failed=${errors.length}`)

    const status = errors.length === files.length ? 422 : errors.length > 0 ? 207 : 201
    return ok({ documents, errors }, status)
  } catch (err) {
    return handleError(err)
  }
}
