/**
 * Document processing pipeline — two-phase strategy.
 *
 * Phase 1 (fast, ~seconds):
 *   UPLOADED → create placeholder case (processing_phase='analyzing')
 *   → mark documents COMPLETED so the upload UI shows progress immediately.
 *
 * Phase 2 (background, ~minutes):
 *   OCR (EasyOCR) → LLM extraction → UPDATE existing case → processing_phase='complete'
 *   This runs fire-and-forget after Phase 1 resolves.
 *   If OCR service is unavailable, processing_phase stays 'preview'.
 *
 * DB status on case_file_documents tracks upload-pipeline progress (shown in /processing view).
 * processing_phase on case_files tracks enrichment depth (shown as banner on case detail).
 */
import { Agent } from 'undici'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractCaseMetadata } from '@/lib/llm/extraction'
import type { DocumentProcessingStatus } from '@/types/document'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? 'http://localhost:8001'

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

// ── Storage download ──────────────────────────────────────────────────────────

async function downloadFile(db: AnyDB, storageKey: string): Promise<Blob> {
  const { data, error } = await db.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'documents')
    .download(storageKey)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
  return data as Blob
}

// ── Phase 2: OCR ──────────────────────────────────────────────────────────────

async function runOCR(blob: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filename)

  let res: Response
  try {
    res = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: form,
      // @ts-expect-error -- undici dispatcher not in DOM types
      dispatcher: ocrDispatcher,
    })
  } catch (err) {
    throw new Error(`OCR service unreachable: ${(err as Error).message}`)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OCR service error ${res.status}: ${body}`)
  }

  const { text, pages } = await res.json() as { text: string; pages: number }
  console.log(`[pipeline] OCR ok — pages=${pages} chars=${text?.length ?? 0}`)
  if (!text?.trim()) throw new Error('OCR returned empty text')
  return text
}

// ── Case insert helpers ───────────────────────────────────────────────────────

async function resolveInitialState(db: AnyDB): Promise<string> {
  const { data, error } = await db
    .from('workflow_states')
    .select('id')
    .eq('code', 'initial_filing')
    .single()
  if (error || !data) throw new Error('Could not resolve initial workflow state')
  return data.id
}

async function createPlaceholderCase(
  db: AnyDB,
  caseNumber: string,
  phase: 'preview' | 'analyzing',
  uploadedBy: string,
): Promise<string> {
  const stateId = await resolveInitialState(db)

  const { data, error } = await db
    .from('case_files')
    .insert({
      case_number:               caseNumber,
      caption:                   caseNumber,
      title:                     null,
      filing_date:               null,
      claim_amount:              null,
      confidence_missing_fields: [],
      documents_detected:        [],
      important_dates:           [],
      legal_claim:               {},
      processing_phase:          phase,
      current_status_id:         stateId,
      created_by:                uploadedBy,
      updated_by:                uploadedBy,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Placeholder case creation failed: ${error?.message}`)
  return data.id
}

async function enrichCase(
  db: AnyDB,
  caseFileId: string,
  metadata: Awaited<ReturnType<typeof extractCaseMetadata>>,
  uploadedBy: string,
) {
  const { case: c, plaintiff, defendants, employer, insurance_company, accident, medical,
          administrative_proceedings, legal_claim, lawyers, important_dates,
          documents_detected, summary, confidence } = metadata

  const { error: caseUpdateError } = await db.from('case_files').update({
    case_number:               c.case_number,
    caption:                   c.title ?? c.case_number,
    title:                     c.title ?? null,
    court:                     c.court ?? null,
    jurisdiction:              c.jurisdiction ?? null,
    clerk_office:              c.department ?? null,
    department:                c.department ?? null,
    process_type:              c.process_type ?? null,
    matter:                    c.legal_matter ?? null,
    legal_matter:              c.legal_matter ?? null,
    filing_date:               c.filing_date ?? null,
    claim_amount:              c.claim_amount ?? null,
    summary:                   summary ?? null,
    confidence_overall:        confidence?.overall ?? null,
    confidence_missing_fields: confidence?.missing_fields ?? [],
    documents_detected:        documents_detected ?? [],
    important_dates:           important_dates ?? [],
    legal_claim:               legal_claim ?? {},
    processing_phase:          'complete',
    updated_by:                uploadedBy,
  }).eq('id', caseFileId)

  if (caseUpdateError) throw new Error(`case_files enrichment update failed: ${caseUpdateError.message}`)

  // Satellite upserts — delete existing rows first to avoid duplicates on re-run
  await db.from('case_file_plaintiff').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_accident').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_medical').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_insurance').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_employer').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_admin_proceedings').delete().eq('case_file_id', caseFileId)
  await db.from('case_file_parties').delete().eq('case_file_id', caseFileId)

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

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runProcessingPipeline(documentIds: string[]): Promise<void> {
  const db = createAdminClient() as AnyDB
  if (!documentIds.length) return

  console.log(`[pipeline] Starting batch — ${documentIds.length} document(s)`)

  interface DocRow {
    id: string
    storage_key: string
    original_filename: string
    uploaded_by: string
    processing_status: DocumentProcessingStatus
  }

  const { data: docs, error: docsError } = await db
    .from('case_file_documents')
    .select('id, storage_key, original_filename, uploaded_by, processing_status')
    .in('id', documentIds)

  if (docsError || !docs?.length) {
    console.error('[pipeline] Could not load documents:', docsError)
    return
  }

  const pending = (docs as DocRow[]).filter((d) => d.processing_status === 'UPLOADED')
  if (!pending.length) return

  const uploadedBy = pending[0].uploaded_by

  // ══ PHASE 1 — create placeholder case instantly ═══════════════════════════════

  // OCR service availability — quick ping
  const ocrAvailable = await fetch(`${OCR_SERVICE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(3000) })
    .then((r) => r.ok)
    .catch(() => false)

  const processingPhase = ocrAvailable ? 'analyzing' : 'preview'
  const placeholderNum  = `BORRADOR-${new Date().toISOString().slice(0, 10)}`

  let caseFileId: string

  try {
    caseFileId = await createPlaceholderCase(db, placeholderNum, processingPhase, uploadedBy)
    console.log(`[pipeline:p1] placeholder case created: ${caseFileId} (phase=${processingPhase})`)
  } catch (err) {
    console.error('[pipeline:p1] case creation failed:', err)
    await Promise.all(pending.map((d) => setError(db, d.id, 'CASE_GENERATION', String((err as Error).message))))
    return
  }

  // Attach all docs to the case and mark COMPLETED so the upload UI shows progress
  await db.from('case_file_documents').update({ case_file_id: caseFileId }).in('id', documentIds)
  await Promise.all(pending.map((d) => setStatus(db, d.id, 'COMPLETED')))

  console.log(`[pipeline:p1] ✓ Phase 1 complete — case=${caseFileId} docs=${pending.length}`)

  // ══ PHASE 2 — OCR + LLM enrichment (background) ══════════════════════════════

  if (!ocrAvailable) {
    console.log('[pipeline] OCR service not available — Phase 2 skipped, case stays in preview')
    return
  }

  const phase2Docs = pending.map((d) => ({ id: d.id, filename: d.original_filename, storage_key: d.storage_key }))
  runPhase2(db, phase2Docs, caseFileId, uploadedBy)
    .catch((err) => console.error('[pipeline:p2] unhandled error:', err))
}

async function runPhase2(
  db: AnyDB,
  pending: Array<{ id: string; filename: string; storage_key: string }>,
  caseFileId: string,
  uploadedBy: string,
) {
  const total = pending.length
  console.log(`[pipeline:p2] Starting Phase 2 — OCR + LLM (${total} doc(s))`)

  await db.from('case_files').update({
    phase2_docs_total:     total,
    phase2_docs_completed: 0,
  }).eq('id', caseFileId)

  let completed = 0
  const ocrResults: Array<
    { id: string; filename: string; text: string; ok: true } |
    { id: string; ok: false }
  > = []

  for (const d of pending) {
    try {
      const blob = await downloadFile(db, d.storage_key)
      const text = await runOCR(blob, d.filename)
      completed++
      console.log(`[pipeline:p2] OCR ${completed}/${total} — ${d.filename} (${text.split(/\s+/).length} words)`)
      // Update progress counter in DB so polling UI shows X/Y
      await db.from('case_files').update({ phase2_docs_completed: completed }).eq('id', caseFileId)
      ocrResults.push({ id: d.id, filename: d.filename, text, ok: true })
    } catch (err) {
      console.error(`[pipeline:p2] OCR failed for ${d.id}:`, err)
      ocrResults.push({ id: d.id, ok: false })
    }
  }

  const ocrOk = ocrResults.filter(
    (r): r is { id: string; filename: string; text: string; ok: true } => r.ok
  )

  if (!ocrOk.length) {
    console.error('[pipeline:p2] No documents survived OCR — case stays in analyzing')
    return
  }

  const combinedText = ocrOk.map((r) => `--- ${r.filename} ---\n${r.text}`).join('\n\n')

  let metadata: Awaited<ReturnType<typeof extractCaseMetadata>>
  try {
    metadata = await extractCaseMetadata(combinedText)
    console.log(`[pipeline:p2] LLM extraction complete — case: ${metadata.case.case_number}`)
  } catch (err) {
    console.error('[pipeline:p2] LLM extraction failed:', err)
    return
  }

  try {
    await enrichCase(db, caseFileId, metadata, uploadedBy)
    console.log(`[pipeline:p2] ✓ Case ${caseFileId} enriched — processing_phase=complete`)
  } catch (err) {
    console.error('[pipeline:p2] Case enrichment failed:', err)
  }
}
