import type { AllowedMimeType } from '@/constants/storage'

export interface StoragePath {
  /** Full path inside the bucket, e.g. cases/abc123/docs/xyz789/20240101_uuid.pdf */
  path: string
  /** The bucket name */
  bucket: string
}

export interface FileValidationResult {
  valid: boolean
  error?: string
}

export interface UploadResult {
  path: string
  fullPath: string
}

export interface DownloadUrlResult {
  signedUrl: string
  expiresAt: Date
}

export interface StorageFileMetadata {
  originalName: string
  mimeType: AllowedMimeType
  sizeBytes: number
  extension: string
}
