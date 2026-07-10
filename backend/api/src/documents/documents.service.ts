import { createHash, randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'
import { NatsService } from '../messaging/nats.service'
import { PipelineService } from '../pipeline/pipeline.service'
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  buildInboxKey,
  maxBytes,
  signedUrlExpiry,
} from './storage.constants'

// Minimal shape of a Multer in-memory file.
interface UploadedFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

interface UploadError {
  file: string
  error: string
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    private readonly supabase: SupabaseService,
    private readonly nats: NatsService,
    private readonly pipeline: PipelineService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  private validate(file: UploadedFile): string | null {
    if (!file.size) return 'File is empty.'
    if (file.size > maxBytes()) return `File exceeds the ${process.env.MAX_DOCUMENT_SIZE_MB ?? 25} MB limit.`
    if (!(file.mimetype in ALLOWED_MIME_TYPES)) {
      return `Unsupported type "${file.mimetype}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`
    }
    return null
  }

  /**
   * Upload a batch of files, create ONE placeholder case for the batch, and
   * publish one OCR job per document. Mirrors the previous fire-and-forget
   * pipeline but split across the API (intake) and the worker (OCR).
   */
  async uploadBatch(files: UploadedFile[], userId: string) {
    if (!files.length) return { documents: [], errors: [{ file: 'unknown', error: 'No files provided.' }] }

    const errors: UploadError[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploaded: any[] = []

    for (const file of files) {
      const validationError = this.validate(file)
      if (validationError) {
        errors.push({ file: file.originalname, error: validationError })
        continue
      }

      const documentId = randomUUID()
      const ext = ALLOWED_MIME_TYPES[file.mimetype]
      const key = buildInboxKey(userId, documentId, ext)
      const checksum = createHash('sha256').update(file.buffer).digest('hex')

      try {
        await this.supabase.uploadObject(key, file.buffer, file.mimetype)
      } catch (err) {
        errors.push({ file: file.originalname, error: (err as Error).message })
        continue
      }

      const { data, error } = await this.db
        .from('case_file_documents')
        .insert({
          id: documentId,
          case_file_id: null,
          original_filename: file.originalname,
          file_extension: ext,
          file_size: file.size,
          mime_type: file.mimetype,
          storage_path: key,
          storage_provider: 'supabase',
          storage_bucket: this.supabase.bucket,
          storage_key: key,
          file_checksum: checksum,
          origin: 'MANUAL',
          processing_status: 'UPLOADED',
          processing_stage_updated_at: new Date().toISOString(),
          uploaded_by: userId,
          version_number: 1,
        })
        .select()
        .single()

      if (error || !data) {
        await this.supabase.deleteObject(key).catch(() => null)
        errors.push({ file: file.originalname, error: error?.message ?? 'DB insert failed' })
        continue
      }

      uploaded.push(data)
    }

    if (!uploaded.length) {
      return { documents: [], errors }
    }

    // ── Phase 1: one placeholder case for the whole batch ──────────────────────
    const placeholderNum = `BORRADOR-${new Date().toISOString().slice(0, 10)}`
    const caseId = await this.pipeline.createPlaceholderCase(placeholderNum, userId, uploaded.length)

    const ids = uploaded.map((d) => d.id)
    await this.db.from('case_file_documents').update({ case_file_id: caseId }).in('id', ids)
    await this.db
      .from('case_file_documents')
      .update({ processing_status: 'COMPLETED', processing_stage_updated_at: new Date().toISOString() })
      .in('id', ids)

    // Reflect the attachment in the returned rows so the UI links to the case.
    uploaded.forEach((d) => {
      d.case_file_id = caseId
      d.processing_status = 'COMPLETED'
    })

    this.logger.log(`Phase 1 ✓ — case=${caseId} docs=${uploaded.length}`)

    // ── Publish one OCR job per document (signed URL, no creds to the worker) ───
    for (const doc of uploaded) {
      try {
        const downloadUrl = await this.supabase.createSignedUrl(doc.storage_key, signedUrlExpiry())
        await this.nats.publishOcrRequest({
          jobId: randomUUID(),
          caseId,
          documentId: doc.id,
          filename: doc.original_filename,
          mime: doc.mime_type,
          downloadUrl,
        })
      } catch (err) {
        this.logger.error(`Failed to enqueue OCR for doc ${doc.id}: ${(err as Error).message}`)
      }
    }

    return { documents: uploaded, errors }
  }
}
