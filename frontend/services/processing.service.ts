/**
 * Processing pipeline simulation.
 *
 * Each document advances through stages automatically based on time elapsed
 * since the last stage transition (processing_stage_updated_at).
 *
 * When real AI workers are added, they will update processing_status directly
 * via the service-role client and this simulation layer is bypassed.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentProcessingStatus } from '@/types/document'

// Minimum seconds a document must stay in each stage before auto-advancing.
const STAGE_DURATION_SECONDS: Partial<Record<DocumentProcessingStatus, number>> = {
  UPLOADED:            3,
  OCR_IN_PROGRESS:    20,
  METADATA_EXTRACTION: 15,
  CASE_GENERATION:    12,
}

const NEXT_STAGE: Partial<Record<DocumentProcessingStatus, DocumentProcessingStatus>> = {
  UPLOADED:            'OCR_IN_PROGRESS',
  OCR_IN_PROGRESS:    'METADATA_EXTRACTION',
  METADATA_EXTRACTION: 'CASE_GENERATION',
  CASE_GENERATION:    'COMPLETED',
}

/**
 * Checks all in-progress documents and advances any that have been in their
 * current stage long enough. Safe to call on every poll — uses service-role
 * client to bypass RLS.
 */
export async function advanceProcessingStages(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Fetch all non-terminal documents
  const { data: docs, error } = await db
    .from('case_file_documents')
    .select('id, processing_status, processing_stage_updated_at')
    .is('deleted_at', null)
    .not('processing_status', 'in', '("COMPLETED","ERROR")')

  if (error || !docs?.length) return

  const now = Date.now()
  const toAdvance: { id: string; next: DocumentProcessingStatus }[] = []

  for (const doc of docs) {
    const status = doc.processing_status as DocumentProcessingStatus
    const minDuration = STAGE_DURATION_SECONDS[status]
    const next = NEXT_STAGE[status]
    if (!minDuration || !next) continue

    const elapsed = (now - new Date(doc.processing_stage_updated_at).getTime()) / 1000
    if (elapsed >= minDuration) {
      toAdvance.push({ id: doc.id, next })
    }
  }

  if (!toAdvance.length) return

  // Batch update — one round-trip per unique next status
  await Promise.all(
    toAdvance.map(({ id, next }) =>
      db
        .from('case_file_documents')
        .update({
          processing_status: next,
          processing_stage_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    )
  )
}
