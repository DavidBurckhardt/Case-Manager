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
   * publish a single extraction job for it. The documents go straight to the
   * LLM (no OCR); the pipeline consumer downloads them and extracts in one call.
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
      const checksum = createHash('sha256').update(file.buffer).digest('hex')

      // Content-based dedup: if this user already uploaded the same bytes,
      // reuse the existing storage object instead of uploading a duplicate.
      const { data: dedupDoc } = await this.db
        .from('case_file_documents')
        .select('storage_key, storage_bucket, file_extension')
        .eq('file_checksum', checksum)
        .eq('uploaded_by', userId)
        .not('storage_key', 'is', null)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      let storageKey: string  // actual object key in Storage (shared on dedup)
      let storagePath: string // logical path for this DB row (always unique)
      let ext: string
      let storageBucket: string

      if (dedupDoc?.storage_key) {
        // Dedup hit: reuse the existing storage object but generate a unique
        // storage_path for this new DB row (the column has a unique constraint).
        ext = dedupDoc.file_extension
        storageBucket = dedupDoc.storage_bucket
        storageKey = dedupDoc.storage_key
        storagePath = buildInboxKey(userId, documentId, ext)
        this.logger.log(`Dedup — ${file.originalname}: reusing existing storage object`)
      } else {
        ext = ALLOWED_MIME_TYPES[file.mimetype]
        storageBucket = this.supabase.bucket
        storageKey = buildInboxKey(userId, documentId, ext)
        storagePath = storageKey
        try {
          await this.supabase.uploadObject(storageKey, file.buffer, file.mimetype)
        } catch (err) {
          errors.push({ file: file.originalname, error: (err as Error).message })
          continue
        }
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
          storage_path: storagePath,
          storage_provider: 'supabase',
          storage_bucket: storageBucket,
          storage_key: storageKey,
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
        // Only clean up storage if we just uploaded (skip if this was a dedup reuse).
        if (!dedupDoc?.storage_key) await this.supabase.deleteObject(storageKey).catch(() => null)
        errors.push({ file: file.originalname, error: error?.message ?? 'DB insert failed' })
        continue
      }

      uploaded.push(data)
    }

    if (!uploaded.length) {
      return { documents: [], errors }
    }

    // ── Phase 1: one placeholder case for the whole batch ──────────────────────
    const placeholderNum = `BORRADOR-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
    let caseId: string
    try {
      caseId = await this.pipeline.createPlaceholderCase(placeholderNum, userId, uploaded.length)
    } catch (err) {
      // Mark already-uploaded docs as ERROR so they don't linger as UPLOADED orphans.
      const ids = uploaded.map((d) => d.id)
      await this.db
        .from('case_file_documents')
        .update({ processing_status: 'ERROR', processing_error: (err as Error).message, processing_error_stage: 'CASE_GENERATION' })
        .in('id', ids)
      throw err
    }

    const ids = uploaded.map((d) => d.id)
    await this.db.from('case_file_documents').update({ case_file_id: caseId! }).in('id', ids)
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

    // ── Publish a single extraction job for the whole case ─────────────────────
    try {
      await this.nats.publishExtractRequest({
        jobId: randomUUID(),
        caseId,
        documents: uploaded.map((doc) => ({
          documentId: doc.id,
          filename: doc.original_filename,
          mime: doc.mime_type,
          storageKey: doc.storage_key,
        })),
      })
    } catch (err) {
      this.logger.error(`Failed to enqueue extraction for case ${caseId}: ${(err as Error).message}`)
    }

    return { documents: uploaded, errors }
  }
}
