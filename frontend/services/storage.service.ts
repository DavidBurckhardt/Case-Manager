import { buildDocumentPath, buildInboxDocumentPath, buildDocumentFolderPath } from '@/lib/storage/paths'
import { sha256Hex } from '@/lib/storage/checksum'
import { getStorageProvider } from '@/lib/storage/providers'
import { SIGNED_URL_EXPIRY_SECONDS } from '@/constants/storage'
import type { AllowedMimeType } from '@/constants/storage'

export interface DocumentUploadResult {
  /** Canonical object key inside the bucket (immutable, used as storage_key) */
  storageKey: string
  /** Full provider path returned after upload */
  fullPath: string
  /** Name of the storage provider (e.g. 'supabase', 's3') */
  provider: string
  /** Bucket name */
  bucket: string
  /** SHA-256 hex digest of the original file */
  checksum: string
}

export interface SignedUrlResult {
  signedUrl: string
  expiresAt: Date
}

/**
 * Uploads a document to the active storage provider.
 * - Key is deterministic and unique (never reused — upsert:false enforced by provider).
 * - Checksum is computed before upload to guarantee original-file integrity.
 */
export async function uploadDocument(params: {
  file: File | Buffer
  fileName: string
  mimeType: AllowedMimeType
  documentId: string
  caseId?: string
  userId?: string
}): Promise<DocumentUploadResult> {
  const { file, mimeType, caseId, documentId, userId } = params

  const storageKey = caseId
    ? buildDocumentPath({ caseId, documentId, mimeType })
    : buildInboxDocumentPath({ userId: userId!, documentId, mimeType })

  console.log(`[storage.service] uploadDocument start — documentId=${documentId} key=${storageKey}`)

  const [checksum] = await Promise.all([
    sha256Hex(file instanceof File ? file : file),
  ])

  const provider = getStorageProvider()
  console.log(`[storage.service] using provider="${provider.name}" bucket="${provider.bucket}"`)

  const result = await provider.upload({
    key: storageKey,
    body: file,
    contentType: mimeType,
  })

  console.log(`[storage.service] uploadDocument ok — documentId=${documentId} resultKey=${result.key}`)

  return {
    storageKey: result.key,
    fullPath: result.key,
    provider: result.provider,
    bucket: result.bucket,
    checksum,
  }
}

/**
 * Returns a time-limited signed URL for secure document download.
 * The URL expires after SIGNED_URL_EXPIRY_SECONDS (default 1 hour).
 */
export async function getSignedDownloadUrl(
  storageKey: string,
  expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS
): Promise<SignedUrlResult> {
  const provider = getStorageProvider()
  const { url, expiresAt } = await provider.getSignedUrl(storageKey, expiresInSeconds)
  return { signedUrl: url, expiresAt }
}

/**
 * Deletes a single object from storage.
 * Called during soft-delete cleanup; best-effort (errors are swallowed by callers).
 */
export async function deleteDocument(storageKey: string): Promise<void> {
  const provider = getStorageProvider()
  await provider.delete(storageKey)
}

/**
 * Deletes all objects under a document's folder prefix.
 * Used when removing all versions of a document.
 */
export async function deleteDocumentFolder(caseId: string, documentId: string): Promise<void> {
  // For Supabase, list the folder then batch-delete.
  // For S3-compatible providers, a prefix delete can be done server-side.
  // The SupabaseStorageProvider handles the list+delete internally via deleteMany.
  const prefix = buildDocumentFolderPath(caseId, documentId)
  const provider = getStorageProvider()

  // Provider-specific list is not part of the generic interface;
  // Supabase admin client is used directly for listing here to keep the interface lean.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: files } = await supabase.storage.from(provider.bucket).list(prefix)
  if (!files?.length) return

  await provider.deleteMany(files.map((f) => `${prefix}${f.name}`))
}
