import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CaseFileDetail,
  CaseFileSummary,
  ListCaseFilesResponse,
} from '@/types/case-file'
import type {
  CreateCaseFileInput,
  UpdateCaseFileInput,
  ListCaseFilesQuery,
} from '@/lib/validations/case-file'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new ApiError('Unauthorized', 401)
  return { supabase, userId: user.id }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCaseFile(input: CreateCaseFileInput): Promise<CaseFileDetail> {
  const { supabase, userId } = await requireUser()
  const db = supabase as AnySupabase
  const { parties, ...caseData } = input

  const { data: existing } = await db
    .from('case_files')
    .select('id')
    .eq('case_number', caseData.case_number)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    throw new ApiError(`Case number "${caseData.case_number}" already exists.`, 409)
  }

  const { data: caseFile, error } = await db
    .from('case_files')
    .insert({ ...caseData, created_by: userId, updated_by: userId })
    .select()
    .single()

  if (error) throw new ApiError(error.message)

  if (parties?.length) {
    const { error: partiesError } = await db
      .from('case_file_parties')
      .insert(parties.map((p: object) => ({ ...p, case_file_id: caseFile.id })))
    if (partiesError) throw new ApiError(partiesError.message)
  }

  return getCaseFileById(caseFile.id)
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCaseFileById(id: string): Promise<CaseFileDetail> {
  const { supabase } = await requireUser()
  const db = supabase as AnySupabase

  const { data, error } = await db
    .from('case_files')
    .select(`
      *,
      current_status:workflow_states(*),
      parties:case_file_parties(id, name, role, cuit, party_type, notes),
      plaintiff:case_file_plaintiff(*),
      accident:case_file_accident(*),
      medical:case_file_medical(*),
      insurance:case_file_insurance(*),
      employer:case_file_employer(*),
      admin_proceedings:case_file_admin_proceedings(*)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) throw new ApiError('Case file not found.', 404)

  return data as CaseFileDetail
}

export async function listCaseFiles(query: ListCaseFilesQuery): Promise<ListCaseFilesResponse> {
  const { supabase } = await requireUser()
  const db = supabase as AnySupabase
  const { page, page_size, search, matter, court, status_id, attorney_id } = query
  const offset = (page - 1) * page_size

  let q = db
    .from('case_files')
    .select(
      `id, case_number, caption, title, jurisdiction, court, matter, claim_amount,
       processing_phase, responsible_attorney_id, created_at, updated_at,
       current_status:workflow_states(id, code, label)`,
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + page_size - 1)

  if (search) {
    q = q.or(`case_number.ilike.%${search}%,caption.ilike.%${search}%,court.ilike.%${search}%`)
  }
  if (matter)      q = q.ilike('matter', `%${matter}%`)
  if (court)       q = q.ilike('court', `%${court}%`)
  if (status_id)   q = q.eq('current_status_id', status_id)
  if (attorney_id) q = q.eq('responsible_attorney_id', attorney_id)

  const { data, error, count } = await q

  if (error) throw new ApiError(error.message)

  return {
    data: (data ?? []) as CaseFileSummary[],
    total: count ?? 0,
    page,
    page_size,
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCaseFile(
  id: string,
  input: UpdateCaseFileInput
): Promise<CaseFileDetail> {
  const { supabase, userId } = await requireUser()
  const db = supabase as AnySupabase
  const { parties, ...caseData } = input

  if (caseData.case_number) {
    const { data: existing } = await db
      .from('case_files')
      .select('id')
      .eq('case_number', caseData.case_number)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle()

    if (existing) {
      throw new ApiError(`Case number "${caseData.case_number}" is already in use.`, 409)
    }
  }

  const { error } = await db
    .from('case_files')
    .update({ ...caseData, updated_by: userId })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) throw new ApiError(error.message)

  if (parties !== undefined) {
    await db.from('case_file_parties').delete().eq('case_file_id', id)

    if (parties.length) {
      const { error: partiesError } = await db
        .from('case_file_parties')
        .insert(
          parties.map(({ id: _id, ...p }: { id?: string; [k: string]: unknown }) => ({
            ...p,
            case_file_id: id,
          }))
        )
      if (partiesError) throw new ApiError(partiesError.message)
    }
  }

  return getCaseFileById(id)
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

export async function softDeleteCaseFile(id: string): Promise<void> {
  const { supabase, userId } = await requireUser()
  const db = supabase as AnySupabase

  console.log(`[case-file.service] softDeleteCaseFile start — caseId=${id} userId=${userId}`)

  // Authorization check via the normal RLS-enforced client: this SELECT only
  // succeeds if the user owns the case or is an admin (same rule the UPDATE
  // policy enforces). Confirming here lets us safely do the actual write
  // through the admin client below.
  const { data: existing, error: selectError } = await db
    .from('case_files')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (selectError || !existing) throw new ApiError('Case file not found.', 404)

  // The write itself has to go through the admin client (bypassing RLS):
  // PostgREST always performs an internal RETURNING to report the affected
  // row count, which re-evaluates the SELECT policy on the NEW row. Our own
  // SELECT policy requires deleted_at IS NULL, so a row we just soft-deleted
  // can never satisfy it — Postgres raises "new row violates row-level
  // security policy" even though the write is fully authorized.
  const admin = createAdminClient() as AnySupabase
  const { error } = await admin
    .from('case_files')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_by: userId,
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error(`[case-file.service] softDeleteCaseFile failed — caseId=${id} userId=${userId}:`, error)
    throw new ApiError(error.message)
  }

  console.log(`[case-file.service] softDeleteCaseFile done — caseId=${id}`)
}
