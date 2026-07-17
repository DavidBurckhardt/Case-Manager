export type DocumentOrigin = 'MANUAL' | 'EMAIL' | 'PJN' | 'SNEJ' | 'SYSTEM' | 'API' | 'INTEGRATION'

export type DocumentProcessingStatus =
  | 'UPLOADED'
  | 'METADATA_EXTRACTION'
  | 'CASE_GENERATION'
  | 'COMPLETED'
  | 'ERROR'

/** Statuses that represent a terminal (non-progressing) state */
export const TERMINAL_PROCESSING_STATUSES = new Set<DocumentProcessingStatus>([
  'COMPLETED',
  'ERROR',
])

export function isTerminalStatus(s: DocumentProcessingStatus): boolean {
  return TERMINAL_PROCESSING_STATUSES.has(s)
}

export type StorageProviderName = 'supabase' | 's3' | 'r2' | 'azure' | 'gcs' | 'minio'

export interface CaseFileDocumentRow {
  id: string
  case_file_id: string
  original_filename: string
  file_extension: string
  file_size: number
  mime_type: string
  storage_path: string        // legacy alias; equals storage_key
  storage_provider: StorageProviderName
  storage_bucket: string
  storage_key: string         // canonical immutable object key
  file_checksum: string | null  // SHA-256 hex digest
  origin: DocumentOrigin
  processing_status: DocumentProcessingStatus
  processing_error: string | null
  processing_error_stage: string | null
  processing_stage_updated_at: string
  uploaded_by: string
  uploaded_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
  // Versioning (schema ready; not yet functional)
  version_number: number
  parent_document_id: string | null
  superseded_by_document_id: string | null
}

/** Shape returned by list and detail API endpoints */
export interface CaseFileDocument extends CaseFileDocumentRow {
  /** Time-limited signed URL for direct download — present only when requested */
  download_url?: string
}

/** Per-file upload state tracked on the client */
export type UploadFileStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface UploadFileState {
  file: File
  status: UploadFileStatus
  progress: number
  error?: string
  document?: CaseFileDocument
}
