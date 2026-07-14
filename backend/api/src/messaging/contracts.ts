/**
 * Event contracts for the case-extraction job queue (NATS JetStream).
 *
 * The API publishes one extraction job per case and also consumes it: a durable
 * work-queue that keeps uploads non-blocking and survives an API restart. There
 * is no OCR step anymore — the raw documents go straight to the LLM.
 */

export const JOBS_STREAM = 'EXTRACT_JOBS'
export const JOBS_SUBJECT = 'extract.request'
export const JOBS_DURABLE = 'api-extractors'

/** A document reference within an extraction job (bytes stay in Storage). */
export interface ExtractDocument {
  documentId: string
  filename: string
  mime: string
  storageKey: string
}

/** One extraction job per case: all of its documents, extracted in a single LLM call. */
export interface ExtractRequest {
  jobId: string
  caseId: string
  documents: ExtractDocument[]
}
