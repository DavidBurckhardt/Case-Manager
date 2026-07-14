import { createClient } from '@/lib/supabase/server'
import { uploadDocument, getSignedDownloadUrl, deleteDocument } from '@/services/storage.service'
import { validateUploadedFile } from '@/lib/validations/document'
import { ALLOWED_MIME_TYPES } from '@/constants/storage'
import type { AllowedMimeType } from '@/constants/storage'
import type { CaseFileDocument } from '@/types/document'
import { ApiError } from '@/services/case-file.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    console.error('[document.service] requireUser failed:', error?.message ?? 'no user in session')
    throw new ApiError('Unauthorized', 401)
  }
  return { supabase: supabase as AnySupabase, userId: user.id }
}

async function assertCaseAccess(db: AnySupabase, caseFileId: string) {
  const { data, error } = await db
    .from('case_files')
    .select('id')
    .eq('id', caseFileId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) {
    console.error(`[document.service] assertCaseAccess failed — caseFileId=${caseFileId}:`, error?.message ?? 'not found')
    throw new ApiError('Case file not found.', 404)
  }
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadCaseFileDocument(
  caseFileId: string,
  file: File,
  origin: CaseFileDocument['origin'] = 'MANUAL'
): Promise<CaseFileDocument> {
  console.log(`[document.service] uploadCaseFileDocument start — file="${file.name}" size=${file.size} type="${file.type}" caseFileId=${caseFileId}`)

  const { supabase: db, userId } = await requireUser()
  console.log(`[document.service] auth ok — userId=${userId}`)

  await assertCaseAccess(db, caseFileId)
  console.log(`[document.service] case access ok — caseFileId=${caseFileId}`)

  const validationError = validateUploadedFile(file)
  if (validationError) {
    console.error(`[document.service] validation failed — file="${file.name}": ${validationError}`)
    throw new ApiError(validationError, 422)
  }

  const mimeType = file.type as AllowedMimeType
  const ext = ALLOWED_MIME_TYPES[mimeType]
  const documentId = crypto.randomUUID()

  // Upload to storage: computes checksum + enforces immutability (upsert:false)
  let storageKey: string, provider: string, bucket: string, checksum: string
  try {
    ;({ storageKey, provider, bucket, checksum } = await uploadDocument({
      file,
      fileName: file.name,
      mimeType,
      caseId: caseFileId,
      documentId,
    }))
    console.log(`[document.service] storage upload ok — documentId=${documentId} key=${storageKey} provider=${provider}`)
  } catch (err) {
    console.error(`[document.service] storage upload failed — file="${file.name}":`, err)
    throw err
  }

  // Persist metadata — storage_path kept as alias for backwards compat
  const { data, error } = await db
    .from('case_file_documents')
    .insert({
      id: documentId,
      case_file_id: caseFileId,
      original_filename: file.name,
      file_extension: ext,
      file_size: file.size,
      mime_type: mimeType,
      storage_path: storageKey,
      storage_provider: provider,
      storage_bucket: bucket,
      storage_key: storageKey,
      file_checksum: checksum,
      origin,
      processing_status: 'UPLOADED',
      uploaded_by: userId,
      version_number: 1,
    })
    .select()
    .single()

  if (error) {
    console.error(`[document.service] DB insert failed — documentId=${documentId}:`, error)
    await deleteDocument(storageKey).catch(() => null)
    throw new ApiError(`Failed to persist document metadata: ${error.message}`)
  }

  console.log(`[document.service] uploadCaseFileDocument done — documentId=${documentId}`)
  return data as CaseFileDocument
}

// ─── Inbox upload (no case required) ─────────────────────────────────────────

export async function uploadInboxDocument(file: File): Promise<CaseFileDocument> {
  console.log(`[document.service] uploadInboxDocument start — file="${file.name}" size=${file.size} type="${file.type}"`)

  const { supabase: db, userId } = await requireUser()
  console.log(`[document.service] auth ok — userId=${userId}`)

  const validationError = validateUploadedFile(file)
  if (validationError) {
    console.error(`[document.service] validation failed — file="${file.name}": ${validationError}`)
    throw new ApiError(validationError, 422)
  }

  const mimeType = file.type as AllowedMimeType
  const ext = ALLOWED_MIME_TYPES[mimeType]
  const documentId = crypto.randomUUID()

  let storageKey: string, provider: string, bucket: string, checksum: string
  try {
    ;({ storageKey, provider, bucket, checksum } = await uploadDocument({
      file,
      fileName: file.name,
      mimeType,
      documentId,
      userId,
    }))
    console.log(`[document.service] storage upload ok — documentId=${documentId} key=${storageKey} provider=${provider}`)
  } catch (err) {
    console.error(`[document.service] storage upload failed — file="${file.name}":`, err)
    throw err
  }

  const { data, error } = await db
    .from('case_file_documents')
    .insert({
      id: documentId,
      case_file_id: null,
      original_filename: file.name,
      file_extension: ext,
      file_size: file.size,
      mime_type: mimeType,
      storage_path: storageKey,
      storage_provider: provider,
      storage_bucket: bucket,
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

  if (error) {
    console.error(`[document.service] DB insert failed — documentId=${documentId}:`, error)
    await deleteDocument(storageKey).catch(() => null)
    throw new ApiError(`Failed to persist document: ${error.message}`)
  }

  console.log(`[document.service] uploadInboxDocument done — documentId=${documentId}`)
  return data as CaseFileDocument
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCaseFileDocuments(caseFileId: string): Promise<CaseFileDocument[]> {
  const { supabase: db } = await requireUser()

  const { data, error } = await db
    .from('case_file_documents')
    .select('*')
    .eq('case_file_id', caseFileId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) throw new ApiError(error.message)

  return (data ?? []) as CaseFileDocument[]
}

// ─── Cases with their documents (for /documents browser) ─────────────────────

export interface CaseWithDocuments {
  id: string | null
  case_number: string
  title: string | null
  caption: string | null
  created_at: string | null
  documents: CaseFileDocument[]
}

export async function listCasesWithDocuments(): Promise<CaseWithDocuments[]> {
  const { supabase: db } = await requireUser()

  const { data, error } = await db
    .from('case_files')
    .select('id, case_number, title, caption, created_at, documents:case_file_documents(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(error.message)

  const cases: CaseWithDocuments[] = (data ?? []).map((c: CaseWithDocuments) => ({
    ...c,
    documents: (c.documents ?? [])
      .filter((d) => !d.deleted_at)
      .sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '')),
  }))

  // Documents whose case creation failed (or was deleted) — group them apart.
  const { data: orphans, error: orphanErr } = await db
    .from('case_file_documents')
    .select('*')
    .is('case_file_id', null)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (orphanErr) throw new ApiError(orphanErr.message)

  if (orphans?.length) {
    cases.push({
      id: null,
      case_number: 'SIN-EXPEDIENTE',
      title: 'Sin expediente',
      caption: null,
      created_at: null,
      documents: orphans as CaseFileDocument[],
    })
  }

  return cases
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getCaseFileDocument(
  documentId: string,
  includeDownloadUrl = false
): Promise<CaseFileDocument> {
  const { supabase: db } = await requireUser()

  const { data, error } = await db
    .from('case_file_documents')
    .select('*')
    .eq('id', documentId)
    .is('deleted_at', null)
    .single()

  if (error || !data) throw new ApiError('Document not found.', 404)

  const doc = data as CaseFileDocument

  if (includeDownloadUrl) {
    const { signedUrl } = await getSignedDownloadUrl(doc.storage_key)
    doc.download_url = signedUrl
  }

  return doc
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function deleteCaseFileDocument(documentId: string): Promise<void> {
  const { supabase: db, userId } = await requireUser()

  const { data, error } = await db
    .from('case_file_documents')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', documentId)
    .is('deleted_at', null)
    .select('storage_key')
    .single()

  if (error || !data) throw new ApiError('Document not found.', 404)

  await deleteDocument(data.storage_key).catch(() => null)
}

// ─── Integrity verification ───────────────────────────────────────────────────

/**
 * Verifies that the stored checksum matches the file currently in storage.
 * Returns true if intact, false if corrupted or missing.
 * Intended for future scheduled integrity audits.
 */
export async function verifyDocumentIntegrity(documentId: string): Promise<boolean> {
  const { sha256Hex } = await import('@/lib/storage/checksum')
  const doc = await getCaseFileDocument(documentId, true)

  if (!doc.file_checksum || !doc.download_url) return false

  try {
    const response = await fetch(doc.download_url)
    if (!response.ok) return false
    const buffer = Buffer.from(await response.arrayBuffer())
    const computed = await sha256Hex(buffer)
    return computed === doc.file_checksum
  } catch {
    return false
  }
}
