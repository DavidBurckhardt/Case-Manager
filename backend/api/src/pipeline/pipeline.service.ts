import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'
import { NatsService } from '../messaging/nats.service'
import { ExtractionService, ExtractionFile } from '../llm/extraction.service'
import type { ExtractedCase } from '../llm/extraction.schema'
import type { ExtractRequest } from '../messaging/contracts'

/** MIME types the LLM accepts directly (PDF as a file, images as vision input). */
const LLM_SUPPORTED = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/')

/**
 * Orchestrates the two-phase pipeline.
 *
 * Phase 1 (createPlaceholderCase) runs synchronously from the upload request.
 * Phase 2 is event-driven: one extract.request per case is consumed here, the
 * raw documents are downloaded and sent straight to the LLM (no OCR), and the
 * case is enriched (processing_phase → 'complete').
 */
@Injectable()
export class PipelineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PipelineService.name)

  constructor(
    private readonly supabase: SupabaseService,
    private readonly nats: NatsService,
    private readonly extraction: ExtractionService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  async onApplicationBootstrap() {
    await this.nats.consumeRequests((req) => this.handleExtractRequest(req))
  }

  // ── Phase 1 ────────────────────────────────────────────────────────────────

  private async resolveInitialState(): Promise<string> {
    const { data, error } = await this.db
      .from('workflow_states')
      .select('id')
      .eq('code', 'initial_filing')
      .single()
    if (error || !data) throw new Error('Could not resolve initial workflow state')
    return data.id
  }

  async createPlaceholderCase(caseNumber: string, uploadedBy: string, docsTotal: number): Promise<string> {
    const stateId = await this.resolveInitialState()

    const { data, error } = await this.db
      .from('case_files')
      .insert({
        case_number: caseNumber,
        caption: caseNumber,
        title: null,
        filing_date: null,
        claim_amount: null,
        confidence_missing_fields: [],
        documents_detected: [],
        important_dates: [],
        legal_claim: {},
        processing_phase: 'analyzing',
        // No per-document progress anymore: the whole case is extracted in one
        // LLM call, so all docs are "in analysis" at once (drives the UI badge).
        phase2_docs_total: docsTotal,
        phase2_docs_completed: docsTotal,
        current_status_id: stateId,
        created_by: uploadedBy,
        updated_by: uploadedBy,
      })
      .select('id')
      .single()

    if (error || !data) throw new Error(`Placeholder case creation failed: ${error?.message}`)
    return data.id
  }

  // ── Phase 2 (event-driven) ───────────────────────────────────────────────────

  /**
   * Consume one extraction job: download the case's documents, send them raw to
   * the LLM, and enrich the case. Idempotent under JetStream redelivery — a
   * job for a case no longer in 'analyzing' is a no-op, and enrichCase itself
   * is idempotent (it replaces satellite rows).
   */
  private async handleExtractRequest(req: ExtractRequest): Promise<void> {
    const { caseId, documents } = req

    const { data: caseRow, error: caseErr } = await this.db
      .from('case_files')
      .select('processing_phase')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseRow) throw new Error(`Case ${caseId} not found: ${caseErr?.message}`)
    if (caseRow.processing_phase !== 'analyzing') {
      this.logger.log(`Case ${caseId} already in '${caseRow.processing_phase}' — skipping (redelivery)`)
      return
    }

    this.logger.log(`Extract job — case=${caseId} docs=${documents.length}`)

    // Download the raw bytes and keep only what the LLM can read directly.
    const files: ExtractionFile[] = []
    for (const doc of documents) {
      if (!LLM_SUPPORTED(doc.mime)) {
        this.logger.warn(`Skipping unsupported type for LLM: ${doc.filename} (${doc.mime})`)
        await this.db
          .from('case_file_documents')
          .update({ processing_error: `Tipo no soportado por el LLM: ${doc.mime}`, processing_error_stage: 'LLM_EXTRACTION' })
          .eq('id', doc.documentId)
        continue
      }
      const { buffer } = await this.supabase.downloadObject(doc.storageKey)
      files.push({ filename: doc.filename, mime: doc.mime, buffer })
    }

    if (!files.length) {
      this.logger.error(`Case ${caseId} — no LLM-readable documents; leaving as preview`)
      await this.db.from('case_files').update({ processing_phase: 'preview' }).eq('id', caseId)
      return
    }

    let metadata: ExtractedCase
    try {
      metadata = await this.extraction.extractCaseMetadata(files)
    } catch (err) {
      this.logger.error(`LLM extraction failed for case ${caseId}: ${(err as Error).message}`)
      await this.db.from('case_files').update({ processing_phase: 'preview' }).eq('id', caseId)
      return
    }

    try {
      await this.enrichCase(caseId, metadata)
    } catch (err) {
      // Don't nack — a permanent DB error will loop forever calling the LLM.
      // Mark as preview so the idempotency guard stops re-processing.
      this.logger.error(`Case enrichment failed for case ${caseId}: ${(err as Error).message}`)
      await this.db.from('case_files').update({ processing_phase: 'preview' }).eq('id', caseId)
      return
    }
    this.logger.log(`✓ Case ${caseId} enriched — processing_phase=complete`)
  }

  private async enrichCase(caseFileId: string, metadata: ExtractedCase): Promise<void> {
    const {
      case: c, plaintiff, defendants, employer, insurance_company, accident, medical,
      administrative_proceedings, legal_claim, lawyers, important_dates,
      documents_detected, summary, confidence,
    } = metadata

    await this.assignCaseNumber(caseFileId, c.case_number, {
      caption: c.title ?? c.case_number,
      title: c.title ?? null,
      court: c.court ?? null,
      jurisdiction: c.jurisdiction ?? null,
      clerk_office: c.department ?? null,
      department: c.department ?? null,
      process_type: c.process_type ?? null,
      matter: c.legal_matter ?? null,
      legal_matter: c.legal_matter ?? null,
      filing_date: c.filing_date ?? null,
      claim_amount: c.claim_amount ?? null,
      summary: summary ?? null,
      confidence_overall: confidence?.overall ?? null,
      confidence_missing_fields: confidence?.missing_fields ?? [],
      documents_detected: documents_detected ?? [],
      important_dates: important_dates ?? [],
      legal_claim: legal_claim ?? {},
      processing_phase: 'complete',
    })

    // Satellite upserts — delete existing rows first to avoid duplicates on re-run.
    await this.db.from('case_file_plaintiff').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_accident').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_medical').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_insurance').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_employer').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_admin_proceedings').delete().eq('case_file_id', caseFileId)
    await this.db.from('case_file_parties').delete().eq('case_file_id', caseFileId)

    if (plaintiff?.full_name) {
      const { error } = await this.db.from('case_file_plaintiff').insert({
        case_file_id: caseFileId,
        full_name: plaintiff.full_name ?? null,
        dni: plaintiff.dni ?? null,
        cuil: plaintiff.cuil ?? null,
        birth_date: plaintiff.birth_date ?? null,
        nationality: plaintiff.nationality ?? null,
        marital_status: plaintiff.marital_status ?? null,
        address: plaintiff.address ?? null,
        city: plaintiff.city ?? null,
        province: plaintiff.province ?? null,
      })
      if (error) this.logger.error(`plaintiff insert failed: ${error.message}`)
    }

    if (accident?.date || accident?.description) {
      const { error } = await this.db.from('case_file_accident').insert({
        case_file_id: caseFileId,
        accident_type: accident.type ?? null,
        accident_date: accident.date ?? null,
        accident_time: accident.time ?? null,
        location: accident.location ?? null,
        province: accident.province ?? null,
        city: accident.city ?? null,
        description: accident.description ?? null,
        work_activity: accident.work_activity ?? null,
        mechanism: accident.mechanism ?? null,
      })
      if (error) this.logger.error(`accident insert failed: ${error.message}`)
    }

    if (medical) {
      const { error } = await this.db.from('case_file_medical').insert({
        case_file_id: caseFileId,
        diagnosis: medical.diagnosis ?? [],
        affected_body_parts: medical.affected_body_parts ?? [],
        medical_leave_start: medical.medical_leave_start ?? null,
        medical_discharge_date: medical.medical_discharge_date ?? null,
        surgeries: medical.surgeries ?? [],
        treatments: medical.treatments ?? [],
        current_limitations: medical.current_limitations ?? [],
        psychological_damage_claimed: medical.psychological_damage_claimed ?? false,
        permanent_disability: medical.permanent_disability ?? null,
      })
      if (error) this.logger.error(`medical insert failed: ${error.message}`)
    }

    if (insurance_company?.name || insurance_company?.cuit) {
      const { error } = await this.db.from('case_file_insurance').insert({
        case_file_id: caseFileId,
        name: insurance_company.name ?? null,
        cuit: insurance_company.cuit ?? null,
        claim_number: insurance_company.claim_number ?? null,
        policy_number: insurance_company.policy_number ?? null,
      })
      if (error) this.logger.error(`insurance insert failed: ${error.message}`)
    }

    if (employer?.company_name || employer?.cuit) {
      const { error } = await this.db.from('case_file_employer').insert({
        case_file_id: caseFileId,
        company_name: employer.company_name ?? null,
        cuit: employer.cuit ?? null,
        activity: employer.activity ?? null,
      })
      if (error) this.logger.error(`employer insert failed: ${error.message}`)
    }

    if (administrative_proceedings?.medical_commission_case || administrative_proceedings?.resolution_date) {
      const { error } = await this.db.from('case_file_admin_proceedings').insert({
        case_file_id: caseFileId,
        medical_commission_case: administrative_proceedings.medical_commission_case ?? null,
        medical_commission: administrative_proceedings.medical_commission ?? null,
        resolution_date: administrative_proceedings.resolution_date ?? null,
        medical_opinion: administrative_proceedings.medical_opinion ?? null,
        administrative_status: administrative_proceedings.administrative_status ?? null,
      })
      if (error) this.logger.error(`admin_proceedings insert failed: ${error.message}`)
    }

    const partyRows = [
      ...(defendants ?? []).map((d) => ({
        case_file_id: caseFileId,
        name: d.name,
        role: 'defendant' as const,
        cuit: d.cuit ?? null,
        party_type: d.type ?? null,
        notes: null,
      })),
      ...(lawyers ?? [])
        .filter((l) => l.name)
        .map((l) => ({
          case_file_id: caseFileId,
          name: l.name!,
          role: 'lawyer' as const,
          cuit: null,
          party_type: l.representing ?? null,
          notes: l.registration ?? null,
        })),
    ]
    if (partyRows.length) {
      const { error } = await this.db.from('case_file_parties').insert(partyRows)
      if (error) this.logger.error(`parties insert failed: ${error.message}`)
    }
  }

  /**
   * Write the extracted fields, claiming the extracted case_number when it is
   * free. Active cases are unique on case_number, so a re-upload of the same
   * expediente collides with the original. Rather than leave the placeholder
   * BORRADOR number in place, fall back to "<number> (n)" — the convention a
   * file manager uses for duplicate filenames.
   *
   * Candidates are attempted in order: a 23505 means the number was taken
   * (possibly by a job racing this one), so the next suffix is tried.
   */
  private async assignCaseNumber(
    caseFileId: string,
    extractedNumber: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: Record<string, any>,
  ): Promise<void> {
    const MAX_SUFFIX = 50

    for (let n = 0; n <= MAX_SUFFIX; n++) {
      const candidate = n === 0 ? extractedNumber : `${extractedNumber} (${n})`

      const { error } = await this.db
        .from('case_files')
        .update({ ...fields, case_number: candidate })
        .eq('id', caseFileId)

      if (!error) {
        if (n > 0) {
          this.logger.warn(`case_number "${extractedNumber}" already taken — assigned "${candidate}"`)
        }
        return
      }
      if (error.code !== '23505') {
        throw new Error(`case_files enrichment update failed: ${error.message}`)
      }
    }

    throw new Error(`No free case_number for "${extractedNumber}" after ${MAX_SUFFIX} suffixes`)
  }
}
