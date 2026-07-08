import type {
  WorkflowStateRow,
  CaseFileRow,
  CaseFilePartyRow,
} from './case-file'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'user' | 'viewer'
export type CaseStatus = 'active' | 'closed' | 'archived' | 'on_hold'
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ExtractionType = 'full' | 'partial' | 'reprocess'
export type ExtractionStatus = 'pending' | 'running' | 'completed' | 'failed'

// ─── Row types ─────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CaseRow {
  id: string
  created_by: string
  assigned_to: string | null
  case_number: string
  caption: string
  description: string | null
  court: string | null
  jurisdiction: string | null
  case_type: string | null
  status: CaseStatus
  filed_at: string | null
  closed_at: string | null
  metadata: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DocumentRow {
  id: string
  case_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  document_type: string | null
  description: string | null
  processing_status: ProcessingStatus
  uploaded_at: string
  metadata: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface MetadataExtractionRow {
  id: string
  document_id: string
  extractor: string
  extractor_version: string | null
  extraction_type: ExtractionType
  status: ExtractionStatus
  error_message: string | null
  raw_output: Json | null
  extracted_data: Json
  confidence_score: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Insert types ──────────────────────────────────────────────────────────────

export type UserInsert = Omit<UserRow, 'created_at' | 'updated_at'>
export type CaseInsert = Omit<CaseRow, 'id' | 'created_at' | 'updated_at'>
export type DocumentInsert = Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>
export type MetadataExtractionInsert = Omit<
  MetadataExtractionRow,
  'id' | 'created_at' | 'updated_at'
>

// ─── Update types ──────────────────────────────────────────────────────────────

export type CaseUpdate = Partial<
  Pick<
    CaseRow,
    | 'assigned_to'
    | 'caption'
    | 'description'
    | 'court'
    | 'jurisdiction'
    | 'case_type'
    | 'status'
    | 'filed_at'
    | 'closed_at'
    | 'metadata'
    | 'deleted_at'
  >
>

export type DocumentUpdate = Partial<
  Pick<
    DocumentRow,
    'document_type' | 'description' | 'processing_status' | 'metadata' | 'deleted_at'
  >
>

export type MetadataExtractionUpdate = Partial<
  Pick<
    MetadataExtractionRow,
    | 'status'
    | 'error_message'
    | 'raw_output'
    | 'extracted_data'
    | 'confidence_score'
    | 'prompt_tokens'
    | 'completion_tokens'
    | 'total_tokens'
    | 'started_at'
    | 'completed_at'
  >
>

// ─── Supabase Database type (used by createClient<Database>) ──────────────────

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow
        Insert: UserInsert
        Update: Partial<UserRow>
      }
      cases: {
        Row: CaseRow
        Insert: CaseInsert
        Update: CaseUpdate
      }
      documents: {
        Row: DocumentRow
        Insert: DocumentInsert
        Update: DocumentUpdate
      }
      metadata_extractions: {
        Row: MetadataExtractionRow
        Insert: MetadataExtractionInsert
        Update: MetadataExtractionUpdate
      }
      workflow_states: {
        Row: WorkflowStateRow
        Insert: Omit<WorkflowStateRow, 'id' | 'created_at'>
        Update: Partial<WorkflowStateRow>
      }
      case_files: {
        Row: CaseFileRow
        Insert: Omit<
          CaseFileRow,
          'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'deleted_by'
        > & {
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: Partial<Omit<CaseFileRow, 'id' | 'created_at'>>
      }
      case_file_parties: {
        Row: CaseFilePartyRow
        Insert: Omit<CaseFilePartyRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<CaseFilePartyRow>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      case_status: CaseStatus
      processing_status: ProcessingStatus
      extraction_type: ExtractionType
      extraction_status: ExtractionStatus
    }
    CompositeTypes: Record<string, never>
  }
}
