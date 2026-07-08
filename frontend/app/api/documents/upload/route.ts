import { type NextRequest } from 'next/server'
import { uploadInboxDocument } from '@/services/document.service'
import { runProcessingPipeline } from '@/services/pipeline.service'
import { ok, handleError } from '@/lib/api/response'

/**
 * POST /api/documents/upload
 *
 * Accepts one or more files (multipart/form-data, field "files").
 * Each file is:
 *   1. Uploaded to Supabase Storage (inbox/<userId>/...)
 *   2. Persisted in case_file_documents with status UPLOADED
 *
 * All successfully uploaded files are then handed off together (fire-and-forget)
 * to the processing pipeline as a single batch — each gets its own OCR pass, but
 * extraction and case creation run once for the whole batch, so files attached
 * in the same upload always land on exactly one case.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    console.log(`[api/documents/upload] received ${files.length} file(s): ${files.map((f) => f.name).join(', ')}`)

    if (!files.length) {
      return ok({ error: 'No files provided.' }, 422)
    }

    const results = await Promise.allSettled(
      files.map((file) => uploadInboxDocument(file))
    )

    const documents = results
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof uploadInboxDocument>>> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value)

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, i) => ({
        file: files[i]?.name ?? 'unknown',
        error: String(r.reason?.message ?? r.reason),
      }))

    if (errors.length) {
      console.error(`[api/documents/upload] ${errors.length}/${files.length} file(s) failed:`, errors)
    }
    console.log(`[api/documents/upload] result — uploaded=${documents.length} failed=${errors.length}`)

    // Fire-and-forget: kick off the pipeline for the whole batch at once.
    // The pipeline updates processing_status in the DB as it progresses;
    // the frontend picks up changes via polling /api/processing.
    if (documents.length) {
      const documentIds = documents.map((doc) => doc.id)
      runProcessingPipeline(documentIds).catch((err) =>
        console.error(`[upload] Pipeline failed for batch [${documentIds.join(', ')}]:`, err)
      )
    }

    const status = errors.length === files.length ? 422 : errors.length > 0 ? 207 : 201
    return ok({ documents, errors }, status)
  } catch (err) {
    return handleError(err)
  }
}
