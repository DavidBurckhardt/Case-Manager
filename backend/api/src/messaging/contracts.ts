/** Event contracts exchanged with the OCR worker over NATS JetStream. */

export const JOBS_STREAM = 'OCR_JOBS'
export const JOBS_SUBJECT = 'ocr.request'
export const RESULTS_STREAM = 'OCR_RESULTS'
export const RESULTS_SUBJECT = 'ocr.result'
export const RESULTS_DURABLE = 'api-results'

export interface OcrRequest {
  jobId: string
  caseId: string
  documentId: string
  filename: string
  mime: string
  downloadUrl: string
}

export type OcrResult =
  | { jobId: string; caseId: string; documentId: string; ok: true; text: string; pages: number }
  | { jobId: string; caseId: string; documentId: string; ok: false; error: string }
