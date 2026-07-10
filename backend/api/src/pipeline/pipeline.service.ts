import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'
import { NatsService } from '../messaging/nats.service'
import { ExtractionService } from '../llm/extraction.service'
import type { ExtractedCase } from '../llm/extraction.schema'
import type { OcrResult } from '../messaging/contracts'

/**
 * Orchestrates the two-phase pipeline on the results side.
 *
 * Phase 1 (createPlaceholderCase) runs synchronously from the upload request.
 * Phase 2 is event-driven: each ocr.result is aggregated here; when the last
 * document of a case is done, the combined text is sent to the LLM and the
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
    await this.nats.consumeResults((result) => this.handleOcrResult(result))
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
        phase2_docs_total: docsTotal,
        phase2_docs_completed: 0,
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

  private async handleOcrResult(result: OcrResult): Promise<void> {
    const { caseId, documentId } = result

    // Idempotency guard: a document records its OCR outcome exactly once. The
    // conditional update matches zero rows on a redelivered message (JetStream
    // at-least-once), so we neither overwrite nor double-count the progress.
    let firstTime: boolean
    if (result.ok) {
      const { data, error } = await this.db
        .from('case_file_documents')
        .update({ ocr_text: result.text })
        .eq('id', documentId)
        .is('ocr_text', null)
        .select('id')
      if (error) throw new Error(`Persisting ocr_text failed: ${error.message}`)
      firstTime = (data?.length ?? 0) > 0
      this.logger.log(`OCR result — case=${caseId} doc=${documentId} pages=${result.pages} first=${firstTime}`)
    } else {
      const { data, error } = await this.db
        .from('case_file_documents')
        .update({ processing_error: result.error, processing_error_stage: 'OCR_IN_PROGRESS' })
        .eq('id', documentId)
        .is('ocr_text', null)
        .is('processing_error', null)
        .select('id')
      if (error) throw new Error(`Recording OCR failure failed: ${error.message}`)
      firstTime = (data?.length ?? 0) > 0
      this.logger.warn(`OCR failed — case=${caseId} doc=${documentId} first=${firstTime}: ${result.error}`)
    }

    // Redelivery of an already-recorded result — nothing more to do.
    if (!firstTime) return

    // Atomic increment + read — only the message that reaches total triggers finalize.
    const { data, error } = await this.db.rpc('increment_phase2_progress', { p_case_id: caseId })
    if (error) throw new Error(`increment_phase2_progress failed: ${error.message}`)
    const row = Array.isArray(data) ? data[0] : data
    const completed = row?.completed ?? 0
    const total = row?.total ?? 0
    this.logger.log(`Progress — case=${caseId} ${completed}/${total}`)

    if (total > 0 && completed >= total) {
      await this.finalizeCase(caseId)
    }
  }

  private async finalizeCase(caseId: string): Promise<void> {
    const { data: docs, error } = await this.db
      .from('case_file_documents')
      .select('original_filename, ocr_text')
      .eq('case_file_id', caseId)
      .is('deleted_at', null)
    if (error) throw new Error(`Loading OCR text failed: ${error.message}`)

    const withText = (docs ?? []).filter((d: { ocr_text?: string }) => d.ocr_text?.trim())

    if (!withText.length) {
      this.logger.error(`Case ${caseId} — no OCR text survived; leaving as preview`)
      await this.db.from('case_files').update({ processing_phase: 'preview' }).eq('id', caseId)
      return
    }

    const combinedText = withText
      .map((d: { original_filename: string; ocr_text: string }) => `--- ${d.original_filename} ---\n${d.ocr_text}`)
      .join('\n\n')

    let metadata: ExtractedCase
    try {
      metadata = await this.extraction.extractCaseMetadata(combinedText)
    } catch (err) {
      this.logger.error(`LLM extraction failed for case ${caseId}: ${(err as Error).message}`)
      return
    }

    await this.enrichCase(caseId, metadata)
    this.logger.log(`✓ Case ${caseId} enriched — processing_phase=complete`)
  }

  private async enrichCase(caseFileId: string, metadata: ExtractedCase): Promise<void> {
    const {
      case: c, plaintiff, defendants, employer, insurance_company, accident, medical,
      administrative_proceedings, legal_claim, lawyers, important_dates,
      documents_detected, summary, confidence,
    } = metadata

    const { error: caseUpdateError } = await this.db
      .from('case_files')
      .update({
        case_number: c.case_number,
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
      .eq('id', caseFileId)

    if (caseUpdateError) throw new Error(`case_files enrichment update failed: ${caseUpdateError.message}`)

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
}
