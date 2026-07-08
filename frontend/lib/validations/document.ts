import { z } from 'zod'
import { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from '@/constants/storage'

function getMaxBytes() {
  const mb = Number(process.env.MAX_DOCUMENT_SIZE_MB ?? 25)
  return mb * 1024 * 1024
}

export function validateUploadedFile(file: File): string | null {
  if (file.size === 0) return 'File is empty.'
  if (file.size > getMaxBytes()) {
    const limitMb = Number(process.env.MAX_DOCUMENT_SIZE_MB ?? 25)
    return `File exceeds the ${limitMb} MB size limit.`
  }
  if (!(file.type in ALLOWED_MIME_TYPES)) {
    return `Unsupported type "${file.type}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`
  }
  return null
}

export const updateDocumentSchema = z.object({
  processing_status: z
    .enum(['UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'PROCESSED', 'FAILED'])
    .optional(),
})

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
