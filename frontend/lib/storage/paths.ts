import { ALLOWED_MIME_TYPES, type AllowedMimeType } from '@/constants/storage'

/**
 * Builds a deterministic, collision-free storage path for a document.
 *
 * Structure: cases/<caseId>/documents/<documentId>/<datestamp>_<uuid>.<ext>
 *
 * - caseId  → groups files by case for easy bulk operations
 * - documentId → scopes files to a single document record (supports versioning)
 * - datestamp  → sortable prefix; aids debugging and lifecycle queries
 * - uuid        → guarantees uniqueness even across concurrent uploads
 *
 * The original filename is intentionally excluded to avoid leaking PII,
 * special characters, or path traversal risks.
 */
export function buildDocumentPath(params: {
  caseId: string
  documentId: string
  mimeType: AllowedMimeType
}): string {
  const { caseId, documentId, mimeType } = params
  const ext = ALLOWED_MIME_TYPES[mimeType]
  const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const uid = crypto.randomUUID()
  return `cases/${caseId}/documents/${documentId}/${datestamp}_${uid}.${ext}`
}

/** Path for inbox documents (no case assigned yet). */
export function buildInboxDocumentPath(params: {
  userId: string
  documentId: string
  mimeType: AllowedMimeType
}): string {
  const { userId, documentId, mimeType } = params
  const ext = ALLOWED_MIME_TYPES[mimeType]
  const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const uid = crypto.randomUUID()
  return `inbox/${userId}/documents/${documentId}/${datestamp}_${uid}.${ext}`
}

/**
 * Builds the path prefix for all documents belonging to a case.
 * Useful for listing or bulk-deleting a case's files.
 */
export function buildCaseFolderPath(caseId: string): string {
  return `cases/${caseId}/`
}

/**
 * Builds the path prefix for all versions of a single document.
 */
export function buildDocumentFolderPath(caseId: string, documentId: string): string {
  return `cases/${caseId}/documents/${documentId}/`
}

/**
 * Extracts the file extension from a storage path.
 */
export function getExtensionFromPath(path: string): string {
  return path.slice(path.lastIndexOf('.'))
}
