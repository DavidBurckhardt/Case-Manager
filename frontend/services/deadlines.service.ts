import { createClient } from '@/lib/supabase/server'
import { ApiError } from '@/services/case-file.service'

export interface DeadlineRow {
  id: string
  act_type: string
  description: string
  dias_habiles: number
  fecha_inicio: string
  fecha_vencimiento: string
  estado: 'PENDIENTE' | 'CUMPLIDO' | 'VENCIDO'
  tipo: 'FATAL' | 'ORDINARIO'
  case_file_id: string
  case_number: string
  caption: string | null
  title: string | null
}

function todayLocal(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/**
 * Plazos pendientes cuyo vencimiento ya llegó o pasó (T-0).
 * Devuelve 0 ante error: el banner es informativo y no debe romper la ficha.
 */
export async function countOverdueDeadlines(caseFileId: string): Promise<number> {
  const supabase = await createClient()
  const db = supabase as any

  const { count, error } = await db
    .from('case_deadlines')
    .select('id', { count: 'exact', head: true })
    .eq('case_file_id', caseFileId)
    .eq('estado', 'PENDIENTE')
    .lte('fecha_vencimiento', todayLocal())

  if (error) return 0
  return count ?? 0
}

export async function listUpcomingDeadlines(opts: {
  dias?: number
  estado?: string
}): Promise<DeadlineRow[]> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new ApiError('Unauthorized', 401)

  const db = supabase as any

  let q = db
    .from('case_deadlines')
    .select(`
      id, act_type, description, dias_habiles,
      fecha_inicio, fecha_vencimiento, estado, tipo,
      case_file_id,
      case_files!inner(case_number, caption, title)
    `)
    .order('fecha_vencimiento', { ascending: true })
    .limit(200)

  const estado = opts.estado ?? 'PENDIENTE'
  if (estado !== 'TODOS') {
    q = q.eq('estado', estado)
  }

  if (opts.dias != null) {
    const until = new Date()
    until.setDate(until.getDate() + opts.dias)
    q = q.lte('fecha_vencimiento', until.toISOString().slice(0, 10))
  }

  const { data, error } = await q
  if (error) throw new ApiError(error.message)

  return (data ?? []).map((row: any) => ({
    id:                row.id,
    act_type:          row.act_type,
    description:       row.description,
    dias_habiles:      row.dias_habiles,
    fecha_inicio:      row.fecha_inicio,
    fecha_vencimiento: row.fecha_vencimiento,
    estado:            row.estado,
    tipo:              row.tipo,
    case_file_id:      row.case_file_id,
    case_number:       row.case_files.case_number,
    caption:           row.case_files.caption,
    title:             row.case_files.title,
  }))
}
