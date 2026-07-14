/** Allowed MIME types and their canonical extensions. */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xml', '.jpg', '.jpeg', '.png', '.webp']

export function maxBytes(): number {
  const mb = Number(process.env.MAX_DOCUMENT_SIZE_MB ?? 25)
  return mb * 1024 * 1024
}

/** Deterministic, collision-free inbox key. Original filename omitted (PII / traversal safety). */
export function buildInboxKey(userId: string, documentId: string, ext: string): string {
  const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const uid = globalThis.crypto.randomUUID()
  return `inbox/${userId}/documents/${documentId}/${datestamp}_${uid}.${ext}`
}
