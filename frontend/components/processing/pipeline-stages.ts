import type { DocumentProcessingStatus } from '@/types/document'

export interface PipelineStage {
  key: string
  label: string
}

// Four visual stages shown to users.
// OCR + metadata extraction + LLM are all internal "processing" steps — exposed as one.
export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'upload',     label: 'Upload' },
  { key: 'processing', label: 'Processing' },
  { key: 'generate',   label: 'Generate Case' },
  { key: 'complete',   label: 'Complete' },
]

/** Map a DB processing status → 0-based visual stage index */
export function stageIndex(status: DocumentProcessingStatus, errorStage?: string | null): number {
  if (status === 'ERROR') {
    // Place the error indicator at the visual stage where the failure occurred
    const failing = errorStage as DocumentProcessingStatus | undefined
    if (failing === 'CASE_GENERATION') return 2
    if (failing === 'COMPLETED')       return 3
    if (failing === 'OCR_IN_PROGRESS' || failing === 'METADATA_EXTRACTION') return 1
    return 1 // default to processing stage
  }
  switch (status) {
    case 'UPLOADED':            return 0
    case 'OCR_IN_PROGRESS':     return 1
    case 'METADATA_EXTRACTION': return 1
    case 'CASE_GENERATION':     return 2
    case 'COMPLETED':           return 3
    default:                    return 0
  }
}

/** Fraction 0–1 for a linear progress bar */
export function progressFraction(status: DocumentProcessingStatus, errorStage?: string | null): number {
  return stageIndex(status, errorStage) / (PIPELINE_STAGES.length - 1)
}
