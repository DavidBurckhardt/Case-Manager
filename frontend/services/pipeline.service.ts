/**
 * Document processing pipeline orchestrator.
 *
 * Stages:
 *   UPLOADED → OCR_IN_PROGRESS → METADATA_EXTRACTION → CASE_GENERATION → COMPLETED
 *                                                                        ↘ ERROR
 *
 * Each stage updates processing_status + processing_stage_updated_at in the DB
 * so the frontend can track real progress via polling.
 */
import { Agent } from 'undici'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractCaseMetadata } from '@/lib/llm/extraction'
import type { DocumentProcessingStatus } from '@/types/document'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? 'http://localhost:8001'

// Large multi-page PDFs can take EasyOCR (CPU-only) several minutes per document.
// undici's default headersTimeout/bodyTimeout is 300s, which kills the request
// long before a real, healthy OCR response arrives — so this call gets its own
// dispatcher with those timeouts disabled.
const ocrDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 })

// ── DB helpers ────────────────────────────────────────────────────────────────

async function setStatus(
  db: AnyDB,
  documentId: string,
  status: DocumentProcessingStatus,
  extra?: Record<string, unknown>,
) {
  await db
    .from('case_file_documents')
    .update({
      processing_status: status,
      processing_stage_updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', documentId)
}

async function setError(
  db: AnyDB,
  documentId: string,
  errorStage: DocumentProcessingStatus,
  message: string,
) {
  await setStatus(db, documentId, 'ERROR', {
    processing_error: message,
    processing_error_stage: errorStage,
  })
}

// ── Stage 1: OCR ──────────────────────────────────────────────────────────────

async function runOCR(storageKey: string): Promise<string> {
  // Download file from Supabase Storage via admin client
  console.log(`[pipeline] downloading from storage — key=${storageKey}`)
  const db = createAdminClient()
  const { data, error } = await db.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'documents')
    .download(storageKey)

  if (error || !data) {
    console.error(`[pipeline] storage download failed — key=${storageKey}:`, error)
    throw new Error(`Storage download failed: ${error?.message}`)
  }
  console.log(`[pipeline] storage download ok — key=${storageKey} size=${data.size}`)

  // Send to EasyOCR microservice
  const form = new FormData()
  form.append('file', data, storageKey.split('/').pop() ?? 'document')

  console.log(`[pipeline] calling OCR service — ${OCR_SERVICE_URL}/ocr`)
  let res: Response
  try {
    res = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: form,
      // @ts-expect-error -- `dispatcher` is a Node/undici fetch option, not part of the DOM lib types
      dispatcher: ocrDispatcher,
    })
  } catch (err) {
    console.error(`[pipeline] OCR service unreachable at ${OCR_SERVICE_URL}:`, err)
    throw new Error(`OCR service unreachable: ${(err as Error).message}`)
  }

  if (!res.ok) {
    const body = await res.text()
    console.error(`[pipeline] OCR service returned error ${res.status}:`, body)
    throw new Error(`OCR service error ${res.status}: ${body}`)
  }

  const { text, pages } = await res.json() as { text: string; pages: number }
  console.log(`[pipeline] OCR service ok — pages=${pages} chars=${text?.length ?? 0}`)
  if (!text?.trim()) throw new Error('OCR returned empty text')
  return text
}

// ── Stage 2: LLM metadata extraction ─────────────────────────────────────────

async function runExtraction(ocrText: string) {
  return extractCaseMetadata(ocrText)
}

// ── Stage 3: Case generation ──────────────────────────────────────────────────
// Takes the full set of document IDs from the batch so every file uploaded
// together attaches to the single case resolved from their combined text,
// instead of each document racing to match-or-create its own case.

async function runCaseGeneration(
  db: AnyDB,
  documentIds: string[],
  metadata: Awaited<ReturnType<typeof runExtraction>>,
  uploadedBy: string,
) {
  const { case: c, plaintiff, defendants, employer, insurance_company, accident, medical,
          administrative_proceedings, legal_claim, lawyers, important_dates,
          documents_detected, summary, confidence } = metadata

  // Look for an existing active case with the same case_number
  const { data: existing } = await db
    .from('case_files')
    .select('id, case_number')
    .eq('case_number', c.case_number)
    .is('deleted_at', null)
    .maybeSingle()

  let caseFileId: string

  if (existing) {
    caseFileId = existing.id
    console.log(`[pipeline] matched existing case ${caseFileId}`)
  } else {
    const { data: initialState, error: stateError } = await db
      .from('workflow_states')
      .select('id')
      .eq('code', 'initial_filing')
      .single()

    if (stateError || !initialState) throw new Error('Could not resolve initial workflow state')

    const { data: newCase, error: caseError } = await db
      .from('case_files')
      .insert({
        case_number:              c.case_number,
        caption:                  c.title ?? c.case_number,
        title:                    c.title ?? null,
        court:                    c.court ?? null,
        jurisdiction:             c.jurisdiction ?? null,
        clerk_office:             c.department ?? null,
        department:               c.department ?? null,
        process_type:             c.process_type ?? null,
        matter:                   c.legal_matter ?? null,
        legal_matter:             c.legal_matter ?? null,
        filing_date:              c.filing_date ?? null,
        claim_amount:             c.claim_amount ?? null,
        summary:                  summary ?? null,
        confidence_overall:       confidence?.overall ?? null,
        confidence_missing_fields: confidence?.missing_fields ?? [],
        documents_detected:       documents_detected ?? [],
        important_dates:          important_dates ?? [],
        legal_claim:              legal_claim ?? {},
        current_status_id:        initialState.id,
        created_by:               uploadedBy,
        updated_by:               uploadedBy,
      })
      .select('id')
      .single()

    if (caseError || !newCase) throw new Error(`Case creation failed: ${caseError?.message}`)
    caseFileId = newCase.id

    // ── Satellite inserts (all fire-and-forget; errors logged, not fatal) ──

    if (plaintiff?.full_name) {
      const { error } = await db.from('case_file_plaintiff').insert({
        case_file_id:   caseFileId,
        full_name:      plaintiff.full_name ?? null,
        dni:            plaintiff.dni ?? null,
        cuil:           plaintiff.cuil ?? null,
        birth_date:     plaintiff.birth_date ?? null,
        nationality:    plaintiff.nationality ?? null,
        marital_status: plaintiff.marital_status ?? null,
        address:        plaintiff.address ?? null,
        city:           plaintiff.city ?? null,
        province:       plaintiff.province ?? null,
      })
      if (error) console.error('[pipeline] plaintiff insert failed:', error)
    }

    if (accident?.date || accident?.description) {
      const { error } = await db.from('case_file_accident').insert({
        case_file_id:  caseFileId,
        accident_type: accident.type ?? null,
        accident_date: accident.date ?? null,
        accident_time: accident.time ?? null,
        location:      accident.location ?? null,
        province:      accident.province ?? null,
        city:          accident.city ?? null,
        description:   accident.description ?? null,
        work_activity: accident.work_activity ?? null,
        mechanism:     accident.mechanism ?? null,
      })
      if (error) console.error('[pipeline] accident insert failed:', error)
    }

    if (medical) {
      const { error } = await db.from('case_file_medical').insert({
        case_file_id:                 caseFileId,
        diagnosis:                    medical.diagnosis ?? [],
        affected_body_parts:          medical.affected_body_parts ?? [],
        medical_leave_start:          medical.medical_leave_start ?? null,
        medical_discharge_date:       medical.medical_discharge_date ?? null,
        surgeries:                    medical.surgeries ?? [],
        treatments:                   medical.treatments ?? [],
        current_limitations:          medical.current_limitations ?? [],
        psychological_damage_claimed: medical.psychological_damage_claimed ?? false,
        permanent_disability:         medical.permanent_disability ?? null,
      })
      if (error) console.error('[pipeline] medical insert failed:', error)
    }

    if (insurance_company?.name || insurance_company?.cuit) {
      const { error } = await db.from('case_file_insurance').insert({
        case_file_id:  caseFileId,
        name:          insurance_company.name ?? null,
        cuit:          insurance_company.cuit ?? null,
        claim_number:  insurance_company.claim_number ?? null,
        policy_number: insurance_company.policy_number ?? null,
      })
      if (error) console.error('[pipeline] insurance insert failed:', error)
    }

    if (employer?.company_name || employer?.cuit) {
      const { error } = await db.from('case_file_employer').insert({
        case_file_id: caseFileId,
        company_name: employer.company_name ?? null,
        cuit:         employer.cuit ?? null,
        activity:     employer.activity ?? null,
      })
      if (error) console.error('[pipeline] employer insert failed:', error)
    }

    if (administrative_proceedings?.medical_commission_case || administrative_proceedings?.resolution_date) {
      const { error } = await db.from('case_file_admin_proceedings').insert({
        case_file_id:            caseFileId,
        medical_commission_case: administrative_proceedings.medical_commission_case ?? null,
        medical_commission:      administrative_proceedings.medical_commission ?? null,
        resolution_date:         administrative_proceedings.resolution_date ?? null,
        medical_opinion:         administrative_proceedings.medical_opinion ?? null,
        administrative_status:   administrative_proceedings.administrative_status ?? null,
      })
      if (error) console.error('[pipeline] admin_proceedings insert failed:', error)
    }

    // Defendants + lawyers → case_file_parties
    const partyRows = [
      ...(defendants ?? []).map((d) => ({
        case_file_id: caseFileId,
        name:         d.name,
        role:         'defendant' as const,
        cuit:         d.cuit ?? null,
        party_type:   d.type ?? null,
        notes:        null,
      })),
      ...(lawyers ?? []).filter((l) => l.name).map((l) => ({
        case_file_id: caseFileId,
        name:         l.name!,
        role:         'lawyer' as const,
        cuit:         null,
        party_type:   l.representing ?? null,
        notes:        l.registration ?? null,
      })),
    ]
    if (partyRows.length) {
      const { error } = await db.from('case_file_parties').insert(partyRows)
      if (error) console.error('[pipeline] parties insert failed:', error)
    }
  }

  // Associate every document in the batch with the resolved case
  await db
    .from('case_file_documents')
    .update({ case_file_id: caseFileId })
    .in('id', documentIds)

  return { caseFileId, created: !existing }
}

// ── Main pipeline entry point ─────────────────────────────────────────────────
// Runs on a whole upload batch at once: each file gets its own OCR pass (OCR is
// inherently per-file), but extraction and case generation run ONCE against the
// combined text of every file that OCR'd successfully — so a 3-file upload
// produces exactly one case, not three independently-matched/created ones.

export async function runProcessingPipeline(documentIds: string[]): Promise<void> {
  const db = createAdminClient() as AnyDB
  if (!documentIds.length) return

  console.log(`[pipeline] Starting batch pipeline — ${documentIds.length} document(s): ${documentIds.join(', ')}`)

  interface BatchDocRow {
    id: string
    storage_key: string
    uploaded_by: string
    processing_status: DocumentProcessingStatus
    original_filename: string
  }

  const { data: docs, error: docsError } = await db
    .from('case_file_documents')
    .select('id, storage_key, uploaded_by, processing_status, original_filename')
    .in('id', documentIds)

  if (docsError || !docs?.length) {
    console.error(`[pipeline] Could not load batch documents:`, docsError)
    return
  }

  // Idempotency: skip anything already past UPLOADED
  const pending = (docs as BatchDocRow[]).filter((d) => d.processing_status === 'UPLOADED')
  if (!pending.length) return

  const uploadedBy = pending[0].uploaded_by

  // ── OCR (per-document) ────────────────────────────────────────────────────
  await Promise.all(pending.map((d) => setStatus(db, d.id, 'OCR_IN_PROGRESS')))

  const ocrResults = await Promise.all(
    pending.map(async (d) => {
      try {
        const text = await runOCR(d.storage_key)
        console.log(`[pipeline] OCR complete for ${d.id} (${d.original_filename}) — ${text.split(/\s+/).length} words`)
        return { id: d.id, filename: d.original_filename, text, ok: true as const }
      } catch (err) {
        console.error(`[pipeline] OCR failed for ${d.id} (${d.original_filename}):`, err)
        await setError(db, d.id, 'OCR_IN_PROGRESS', String((err as Error).message))
        return { id: d.id, ok: false as const }
      }
    })
  )

  const ocrOk = ocrResults.filter(
    (r): r is { id: string; filename: string; text: string; ok: true } => r.ok
  )
  if (!ocrOk.length) {
    console.error('[pipeline] Batch failed — no documents survived OCR')
    return
  }

  // ── Metadata extraction — one call for the whole batch ───────────────────
  await Promise.all(ocrOk.map((r) => setStatus(db, r.id, 'METADATA_EXTRACTION')))

  const combinedText = ocrOk.map((r) => `--- ${r.filename} ---\n${r.text}`).join('\n\n')

  let metadata: Awaited<ReturnType<typeof runExtraction>>
  try {
    metadata = await runExtraction(combinedText)
    console.log(`[pipeline] Batch extraction complete — case: ${metadata.case.case_number}`)
  } catch (err) {
    console.error('[pipeline] Batch extraction failed:', err)
    await Promise.all(ocrOk.map((r) => setError(db, r.id, 'METADATA_EXTRACTION', String((err as Error).message))))
    return
  }

  // ── Case generation — one case for the whole batch ────────────────────────
  const okIds = ocrOk.map((r) => r.id)
  await Promise.all(okIds.map((id) => setStatus(db, id, 'CASE_GENERATION')))

  try {
    const { caseFileId, created } = await runCaseGeneration(db, okIds, metadata, uploadedBy)
    console.log(`[pipeline] Case ${created ? 'created' : 'matched'}: ${caseFileId} — attached ${okIds.length} document(s)`)
  } catch (err) {
    console.error('[pipeline] Batch case generation failed:', err)
    await Promise.all(okIds.map((id) => setError(db, id, 'CASE_GENERATION', String((err as Error).message))))
    return
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  await Promise.all(okIds.map((id) => setStatus(db, id, 'COMPLETED')))
  console.log(`[pipeline] ✓ Batch processed successfully — ${okIds.length} document(s)`)
}
