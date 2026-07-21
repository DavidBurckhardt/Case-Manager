/**
 * MIME types aceptados y su extensión canónica. Solo se listan formatos que el
 * pipeline realmente puede procesar de punta a punta:
 *   • PDF e imágenes → los lee el LLM de forma nativa.
 *   • DOCX (OOXML)   → se convierte a texto con mammoth antes del LLM.
 * El .doc binario legacy (mammoth no lo soporta) y el XML de CEDs del SNEJ
 * (parseo estructurado propio, alcance v1.0) quedan deliberadamente afuera:
 * aceptarlos generaba expedientes vacíos porque la extracción los descartaba.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp']

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
