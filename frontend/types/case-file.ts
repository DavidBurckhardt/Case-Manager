export type PartyRole =
  | 'plaintiff'
  | 'defendant'
  | 'third_party'
  | 'appellant'
  | 'respondent'
  | 'witness'
  | 'lawyer'
  | 'other'

export interface WorkflowStateRow {
  id: string
  code: string
  label: string
  description: string | null
  is_terminal: boolean
  sort_order: number
  created_at: string
}

export type ProcessingPhase = 'preview' | 'analyzing' | 'complete'

export interface CaseFileRow {
  id: string
  case_number: string
  caption: string
  title: string | null
  jurisdiction: string | null
  court: string | null
  clerk_office: string | null
  department: string | null
  process_type: string | null
  matter: string | null
  legal_matter: string | null
  filing_date: string | null
  claim_amount: number | null
  summary: string | null
  confidence_overall: 'High' | 'Medium' | 'Low' | null
  confidence_missing_fields: string[]
  documents_detected: string[]
  important_dates: Array<{ date: string | null; event: string }>
  legal_claim: Record<string, unknown>
  processing_phase: ProcessingPhase
  current_status_id: string
  responsible_attorney_id: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface CaseFilePartyRow {
  id: string
  case_file_id: string
  name: string
  role: PartyRole
  cuit: string | null
  party_type: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CasePlaintiff {
  id: string
  full_name: string | null
  dni: string | null
  cuil: string | null
  birth_date: string | null
  nationality: string | null
  marital_status: string | null
  address: string | null
  city: string | null
  province: string | null
}

export interface CaseAccident {
  id: string
  accident_type: string | null
  accident_date: string | null
  accident_time: string | null
  location: string | null
  province: string | null
  city: string | null
  description: string | null
  work_activity: string | null
  mechanism: string | null
}

export interface CaseMedical {
  id: string
  diagnosis: string[]
  affected_body_parts: string[]
  medical_leave_start: string | null
  medical_discharge_date: string | null
  surgeries: string[]
  treatments: string[]
  current_limitations: string[]
  psychological_damage_claimed: boolean
  permanent_disability: string | null
}

export interface CaseInsurance {
  id: string
  name: string | null
  cuit: string | null
  claim_number: string | null
  policy_number: string | null
}

export interface CaseEmployer {
  id: string
  company_name: string | null
  cuit: string | null
  activity: string | null
}

export interface CaseAdminProceedings {
  id: string
  medical_commission_case: string | null
  medical_commission: string | null
  resolution_date: string | null
  medical_opinion: string | null
  administrative_status: string | null
}

// ─── Enriched detail view returned by the API ─────────────────────────────────

export interface CaseFileParty {
  id: string
  name: string
  role: PartyRole
  cuit: string | null
  party_type: string | null
  notes: string | null
}

export interface CaseFileDetail extends CaseFileRow {
  current_status: WorkflowStateRow
  parties: CaseFileParty[]
  plaintiff: CasePlaintiff | null
  accident: CaseAccident | null
  medical: CaseMedical | null
  insurance: CaseInsurance | null
  employer: CaseEmployer | null
  admin_proceedings: CaseAdminProceedings | null
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface CreateCaseFileInput {
  case_number: string
  caption: string
  jurisdiction?: string
  court?: string
  clerk_office?: string
  matter?: string
  current_status_id: string
  responsible_attorney_id?: string
  parties?: Array<{ name: string; role: PartyRole; notes?: string }>
}

export interface UpdateCaseFileInput {
  case_number?: string
  caption?: string
  jurisdiction?: string | null
  court?: string | null
  clerk_office?: string | null
  matter?: string | null
  current_status_id?: string
  responsible_attorney_id?: string | null
  parties?: Array<{ id?: string; name: string; role: PartyRole; notes?: string }>
}

// ─── List response ─────────────────────────────────────────────────────────────

export interface CaseFileSummary {
  id: string
  case_number: string
  caption: string
  title: string | null
  jurisdiction: string | null
  court: string | null
  matter: string | null
  claim_amount: number | null
  processing_phase: ProcessingPhase
  current_status: Pick<WorkflowStateRow, 'id' | 'code' | 'label'>
  responsible_attorney_id: string | null
  created_at: string
  updated_at: string
}

export interface ListCaseFilesResponse {
  data: CaseFileSummary[]
  total: number
  page: number
  page_size: number
}
