export const STORAGE_BUCKET = 'documents' as const

/** Maximum file size: 50 MB */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

/** Signed URL expiry for downloads: 1 hour */
export const SIGNED_URL_EXPIRY_SECONDS = 60 * 60

/** Allowed MIME types and their canonical extensions */
export const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TYPES

export const ALLOWED_MIME_TYPE_LIST = Object.keys(ALLOWED_MIME_TYPES) as AllowedMimeType[]

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.xml',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]
