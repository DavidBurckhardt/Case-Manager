import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'
import type { ProceduralActType } from '../llm/extraction.schema'

/**
 * Actos procesales que mueven el expediente de estado. El orden del array es el
 * orden de avance procesal: un documento puede traer varios actos, pero el
 * estado es uno solo, así que se toma el más avanzado.
 */
/**
 * Camino más corto de `from` a `to` sobre las aristas permitidas, devuelto como
 * la lista de estados a atravesar (sin incluir `from`). null si no hay camino.
 *
 * BFS: el grafo tiene ~13 nodos, así que la simplicidad gana sobre cualquier
 * optimización. Los vecinos se recorren ordenados por sort_order para que el
 * resultado sea determinista cuando hay dos caminos de igual longitud.
 *
 * Pura a propósito — separarla del acceso a datos la hace verificable sin base.
 */
export function shortestPath(
  edges: Edge[],
  order: Map<string, number>,
  from: string,
  to: string,
): string[] | null {
  const graph = new Map<string, string[]>()
  for (const e of edges) {
    const next = graph.get(e.from_state_code) ?? []
    next.push(e.to_state_code)
    graph.set(e.from_state_code, next)
  }
  for (const [, next] of graph) {
    next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  }

  const previous = new Map<string, string>()
  const seen = new Set([from])
  const queue = [from]

  while (queue.length) {
    const node = queue.shift()!
    if (node === to) {
      const path: string[] = []
      for (let at = to; at !== from; at = previous.get(at)!) path.unshift(at)
      return path
    }
    for (const next of graph.get(node) ?? []) {
      if (seen.has(next)) continue
      // El destino final sí puede ser un estado declarativo; lo que no se
      // permite es atravesarlo de paso camino a otro.
      if (next !== to && NO_AUTO_PASSTHROUGH.has(next)) continue
      seen.add(next)
      previous.set(next, node)
      queue.push(next)
    }
  }

  return null
}

const ACT_TO_STATE: ReadonlyArray<{ act: ProceduralActType; state: string }> = [
  { act: 'TRASLADO_DEMANDA',            state: 'EN_TRASLADO' },
  { act: 'APERTURA_PRUEBA',             state: 'PRUEBA' },
  { act: 'SENTENCIA_PRIMERA_INSTANCIA', state: 'SENTENCIA_1' },
  { act: 'EXPRESION_AGRAVIOS',          state: 'APELACION' },
]

export interface Edge {
  from_state_code: string
  to_state_code: string
}

/**
 * Estados por los que un fast-forward automático NO puede pasar de paso.
 *
 * Todos son declaraciones del juzgado (rebeldía, caducidad) o acuerdos entre
 * partes: existen porque alguien los decidió, no porque el expediente avanzó.
 * Inferirlos de un documento sería inventar un hecho procesal. Solo se llega a
 * ellos por transición manual y con justificación.
 */
const NO_AUTO_PASSTHROUGH = new Set(['REBELDE', 'CADUCIDAD', 'ACUERDO', 'CERRADO'])

interface ActLike {
  act_type?: ProceduralActType | null
  document_type?: string | null
}

interface TransitionRow {
  id: string
  trigger_type: 'AUTO' | 'MANUAL'
  triggered_by: string | null
  justification: string | null
  source_act_type: string | null
  document_ref: string | null
  created_at: string
  from_state: { code: string; label: string } | null
  to_state: { code: string; label: string }
  triggered_by_name: string | null
}

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name)

  constructor(private readonly supabase: SupabaseService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  // ── Transiciones automáticas (pipeline) ──────────────────────────────────────

  /**
   * Elige el acto más avanzado de la extracción y dispara su transición.
   * El estado del expediente es único, así que aplicar todos los actos en
   * secuencia dejaría el resultado a merced del orden en que el LLM los listó.
   */
  async transitionFromActs(caseId: string, acts: ActLike[]): Promise<void> {
    let best: { index: number; act: ActLike } | null = null

    for (const act of acts) {
      if (!act.act_type) continue
      const index = ACT_TO_STATE.findIndex((m) => m.act === act.act_type)
      if (index === -1) continue
      if (!best || index > best.index) best = { index, act }
    }

    if (!best) {
      this.logger.log(`[${caseId}] Ningún acto mapea a una transición de estado`)
      return
    }

    await this.transitionAuto(caseId, best.act.act_type!, best.act.document_type ?? undefined)
  }

  /**
   * Mueve el expediente al estado que corresponde a `actType`.
   *
   * Un expediente recién creado arranca en INICIADO, pero ningún destino del
   * mapa es adyacente a INICIADO: un TRASLADO_DEMANDA implica que el juzgado ya
   * admitió la demanda y que la notificación ya salió, aunque esos pasos nunca
   * se hayan cargado a mano. Por eso se recorre el camino más corto del grafo y
   * se audita CADA salto por separado, en vez de saltar directo al destino: el
   * historial queda con las etapas procesales que realmente ocurrieron.
   *
   * Nunca propaga: igual que generateForCase en el motor de plazos, una falla
   * acá no debe abortar el pipeline ni marcar el caso como preview. Un camino
   * inexistente tampoco es un error — el LLM puede extraer un acto de un
   * documento viejo que ya no aplica al estado actual.
   */
  async transitionAuto(caseId: string, actType: ProceduralActType, documentRef?: string): Promise<void> {
    try {
      const target = ACT_TO_STATE.find((m) => m.act === actType)
      if (!target) {
        this.logger.warn(`[${caseId}] act_type=${actType} no mapea a ningún estado`)
        return
      }

      const current = await this.getCurrentState(caseId)
      if (!current) {
        this.logger.warn(`[${caseId}] No se pudo resolver el estado actual`)
        return
      }

      if (current.code === target.state) {
        this.logger.log(`[${caseId}] Ya está en ${target.state} — sin cambios`)
        return
      }

      const path = await this.findPath(current.code, target.state)
      if (!path) {
        this.logger.warn(
          `[${caseId}] Sin camino automático ${current.code} → ${target.state} (act_type=${actType}) — ignorado`,
        )
        return
      }

      let fromId = current.id
      let fromCode = current.code
      for (const hop of path) {
        const toId = await this.commit(caseId, fromId, hop, {
          trigger_type: 'AUTO',
          source_act_type: actType,
          document_ref: documentRef ?? null,
        })
        this.logger.log(`[${caseId}] ${fromCode} → ${hop} (AUTO, act_type=${actType})`)
        fromId = toId
        fromCode = hop
      }
    } catch (err) {
      this.logger.error(`[${caseId}] Transición automática falló: ${(err as Error).message}`)
      // sin re-throw — el ciclo de vida no debe romper la extracción
    }
  }

  /** Carga el grafo desde la base y delega la búsqueda en shortestPath(). */
  private async findPath(from: string, to: string): Promise<string[] | null> {
    const { data: edges, error: eErr } = await this.db
      .from('workflow_allowed_transitions')
      .select('from_state_code, to_state_code')
    if (eErr) throw new Error(`No se pudo leer el grafo de transiciones: ${eErr.message}`)

    const { data: states, error: sErr } = await this.db
      .from('workflow_states')
      .select('code, sort_order')
      .order('sort_order')
    if (sErr) throw new Error(`No se pudieron leer los estados: ${sErr.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = new Map<string, number>((states ?? []).map((s: any) => [s.code, s.sort_order]))

    return shortestPath((edges ?? []) as Edge[], order, from, to)
  }

  // ── Transiciones manuales (usuario) ──────────────────────────────────────────

  /**
   * A diferencia de transitionAuto, acá los errores SÍ se propagan: el usuario
   * pidió el cambio explícitamente y necesita saber si no se aplicó.
   */
  async transitionManual(
    caseId: string,
    toStateCode: string,
    userId: string,
    justification: string,
  ): Promise<{ from: string; to: string }> {
    if (!justification?.trim()) {
      throw new BadRequestException('La justificación es obligatoria para una transición manual')
    }

    const current = await this.getCurrentState(caseId)
    if (!current) throw new BadRequestException('No se pudo resolver el estado actual del expediente')

    if (current.code === toStateCode) {
      throw new BadRequestException(`El expediente ya está en estado ${toStateCode}`)
    }

    if (!(await this.isAllowed(current.code, toStateCode))) {
      throw new BadRequestException(`Transición no permitida: ${current.code} → ${toStateCode}`)
    }

    await this.commit(caseId, current.id, toStateCode, {
      trigger_type: 'MANUAL',
      triggered_by: userId,
      justification: justification.trim(),
    })

    this.logger.log(`[${caseId}] ${current.code} → ${toStateCode} (MANUAL, user=${userId})`)
    return { from: current.code, to: toStateCode }
  }

  // ── Lectura ──────────────────────────────────────────────────────────────────

  async getHistory(caseId: string): Promise<TransitionRow[]> {
    const { data, error } = await this.db
      .from('workflow_transitions')
      .select(
        `id, trigger_type, triggered_by, justification, source_act_type, document_ref, created_at,
         from_state:workflow_states!workflow_transitions_from_state_id_fkey(code, label),
         to_state:workflow_states!workflow_transitions_to_state_id_fkey(code, label)`,
      )
      .eq('case_file_id', caseId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(`No se pudo leer el historial: ${error.message}`)

    // triggered_by referencia auth.users, no public.users, así que PostgREST no
    // puede embeber el perfil: se resuelven los nombres en una segunda consulta.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[]
    const userIds = [...new Set(rows.map((r) => r.triggered_by).filter(Boolean))]

    const names = new Map<string, string>()
    if (userIds.length) {
      const { data: users } = await this.db.from('users').select('id, full_name, email').in('id', userIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const u of users ?? []) names.set(u.id, u.full_name || u.email)
    }

    return rows.map((r) => ({
      ...r,
      triggered_by_name: r.triggered_by ? (names.get(r.triggered_by) ?? null) : null,
    })) as TransitionRow[]
  }

  /** Catálogo completo: cada estado con los estados a los que puede pasar. */
  async getStates() {
    const [{ data: states, error: sErr }, { data: edges, error: eErr }] = await Promise.all([
      this.db.from('workflow_states').select('id, code, label, description, sort_order, is_terminal').order('sort_order'),
      this.db.from('workflow_allowed_transitions').select('from_state_code, to_state_code'),
    ])

    if (sErr) throw new Error(`No se pudieron leer los estados: ${sErr.message}`)
    if (eErr) throw new Error(`No se pudieron leer las transiciones: ${eErr.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (states ?? []).map((s: any) => ({
      ...s,
      allowed_transitions: (edges ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((e: any) => e.from_state_code === s.code)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => e.to_state_code),
    }))
  }

  // ── Internos ─────────────────────────────────────────────────────────────────

  private async getCurrentState(caseId: string): Promise<{ id: string; code: string } | null> {
    const { data, error } = await this.db
      .from('case_files')
      .select('current_status_id, current_status:workflow_states(id, code)')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data?.current_status) return null
    return { id: data.current_status.id, code: data.current_status.code }
  }

  private async isAllowed(fromCode: string, toCode: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('workflow_allowed_transitions')
      .select('from_state_code')
      .eq('from_state_code', fromCode)
      .eq('to_state_code', toCode)
      .maybeSingle()

    if (error) throw new Error(`No se pudo validar la transición: ${error.message}`)
    return !!data
  }

  /**
   * Escribe el nuevo estado y deja la fila de auditoría.
   *
   * No es una transacción: PostgREST no expone una, y el orden elegido
   * (update primero) hace que el peor caso sea una transición aplicada sin
   * registro en el historial, en vez de un historial que miente sobre el
   * estado real del expediente.
   *
   * Devuelve el id del estado destino para que un fast-forward pueda encadenar
   * el salto siguiente sin volver a consultar la base.
   */
  private async commit(
    caseId: string,
    fromStateId: string,
    toStateCode: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audit: Record<string, any>,
  ): Promise<string> {
    const { data: toState, error: stateErr } = await this.db
      .from('workflow_states')
      .select('id')
      .eq('code', toStateCode)
      .maybeSingle()

    if (stateErr || !toState) throw new Error(`Estado desconocido: ${toStateCode}`)

    const { error: updateErr } = await this.db
      .from('case_files')
      .update({ current_status_id: toState.id })
      .eq('id', caseId)

    if (updateErr) throw new Error(`No se pudo actualizar el estado: ${updateErr.message}`)

    const { error: auditErr } = await this.db.from('workflow_transitions').insert({
      case_file_id: caseId,
      from_state_id: fromStateId,
      to_state_id: toState.id,
      ...audit,
    })

    if (auditErr) this.logger.error(`[${caseId}] Estado actualizado pero falló la auditoría: ${auditErr.message}`)

    return toState.id
  }
}
