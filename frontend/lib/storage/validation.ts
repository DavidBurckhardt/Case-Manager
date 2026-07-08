import {
  ALLOWED_MIME_TYPE_LIST,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  type AllowedMimeType,
} from '@/constants/storage'
import type { FileValidationResult, StorageFileMetadata } from '@/types/storage'
import { ALLOWED_MIME_TYPES } from '@/constants/storage'

export function validateFile(file: File): FileValidationResult {
  if (file.size === 0) {
    return { valid: false, error: 'The file is empty.' }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
    return { valid: false, error: `File exceeds the ${limitMb} MB size limit.` }
  }

  if (!ALLOWED_MIME_TYPE_LIST.includes(file.type as AllowedMimeType)) {
    return {
      valid: false,
      error: `Unsupported file type "${file.type}". Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    }
  }

  return { valid: true }
}

export function extractFileMetadata(file: File): StorageFileMetadata {
  const mimeType = file.type as AllowedMimeType
  return {
    originalName: file.name,
    mimeType,
    sizeBytes: file.size,
    extension: ALLOWED_MIME_TYPES[mimeType],
  }
}

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPE_LIST.includes(mimeType as AllowedMimeType)
}
