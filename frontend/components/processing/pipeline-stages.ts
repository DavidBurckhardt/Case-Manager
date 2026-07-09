import type { DocumentProcessingStatus } from '@/types/document'
import type { ProcessingPhase } from '@/types/case-file'

export interface PipelineStage {
  key: string
  label: string
}

// Four visual stages reflecting the two-phase processing strategy:
//   Phase 1 (pdf-parse + regex) → Preview
//   Phase 2 (OCR + LLM, background) → Analyzing → Complete
export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'upload',    label: 'Upload' },
  { key: 'preview',   label: 'Preview' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'complete',  label: 'Complete' },
]

/**
 * Map DB status + case processing_phase → 0-based visual stage index.
 * processing_phase is only meaningful once the document is COMPLETED (Phase 1 done).
 */
export function stageIndex(
  status: DocumentProcessingStatus,
  errorStage?: string | null,
  processingPhase?: ProcessingPhase | null,
): number {
  if (status === 'ERROR') {
    const failing = errorStage as DocumentProcessingStatus | undefined
    if (failing === 'CASE_GENERATION') return 2
    if (failing === 'COMPLETED')       return 3
    return 1
  }
  switch (status) {
    case 'UPLOADED':            return 0
    case 'OCR_IN_PROGRESS':     return 1  // Phase 1 in progress → Preview stage
    case 'METADATA_EXTRACTION': return 1
    case 'CASE_GENERATION':     return 1
    case 'COMPLETED':
      // Phase 1 done — where are we in Phase 2?
      if (processingPhase === 'analyzing') return 2  // Phase 2 running
      return 3                                        // Phase 2 done or skipped
    default: return 0
  }
}

/** Fraction 0–1 for a linear progress bar */
export function progressFraction(
  status: DocumentProcessingStatus,
  errorStage?: string | null,
  processingPhase?: ProcessingPhase | null,
): number {
  return stageIndex(status, errorStage, processingPhase) / (PIPELINE_STAGES.length - 1)
}
