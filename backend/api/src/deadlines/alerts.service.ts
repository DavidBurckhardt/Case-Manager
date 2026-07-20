import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { SupabaseService } from '../supabase/supabase.service'
import { HolidaysService } from './holidays.service'
import { addBusinessDays, businessDaysUntil, toDateString } from './business-days'

type AlertType = 'T10' | 'T5' | 'T2' | 'T0'

/**
 * Umbrales de alerta, del más urgente al menos urgente. Ese orden importa:
 * cuando varios se cruzan a la vez (p. ej. el cron estuvo caído una semana)
 * se manda solo el más urgente y los demás se marcan como enviados para no
 * disparar una ráfaga de mails viejos.
 *
 * T10 y T0 no mandan mail: el PRD los cubre con indicadores en la UI
 * (banner in-app y bloqueo visual). Se registran igual para trazabilidad.
 */
const THRESHOLDS: { type: AlertType; days: number; email: boolean }[] = [
  { type: 'T0',  days: 0,  email: false },
  { type: 'T2',  days: 2,  email: true },
  { type: 'T5',  days: 5,  email: true },
  { type: 'T10', days: 10, email: false },
]

/** Art. 310 CPCCN — la instancia caduca a los 90 días hábiles sin impulso. */
const CADUCIDAD_DIAS_HABILES = 90

/**
 * Días hábiles de inactividad que abren el plazo. 10 menos que el vencimiento
 * real para que las alertas T10/T5/T2 alcancen a dispararse antes del T-0.
 */
const CADUCIDAD_TRIGGER_DAYS = CADUCIDAD_DIAS_HABILES - 10

/** Marca en triggered_by_act los plazos abiertos por el timer, no por el LLM. */
const PASSIVE_SOURCE = 'PASSIVE_CADUCIDAD_TIMER'

interface PendingDeadline {
  id: string
  description: string
  fecha_vencimiento: string
  case_file_id: string
  case_number: string
  case_title: string | null
  recipient_id: string | null
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name)
  private resend: Resend | null = null

  constructor(
    private readonly supabase: SupabaseService,
    private readonly holidays: HolidaysService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.supabase.admin
  }

  private get appUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3000'
  }

  async runDailyCheck(): Promise<{ checked: number; sent: number }> {
    const today = toDateString(new Date())
    let checked = 0
    let sent = 0

    try {
      const deadlines = await this.loadPendingDeadlines()
      checked = deadlines.length

      if (deadlines.length === 0) {
        this.logger.log('No pending deadlines — nothing to alert')
        return { checked, sent }
      }

      for (const deadline of deadlines) {
        try {
          const fired = await this.processDeadline(deadline, today)
          if (fired) sent++
        } catch (err) {
          this.logger.error(
            `Alert check failed for deadline ${deadline.id}: ${(err as Error).message}`,
          )
        }
      }

      this.logger.log(`✓ Alertas — ${checked} plazos revisados, ${sent} alertas disparadas`)
      return { checked, sent }
    } catch (err) {
      this.logger.error(`runDailyCheck failed: ${(err as Error).message}`)
      return { checked, sent }
    }
  }

  // ── Caducidad pasiva ───────────────────────────────────────────────────────

  /**
   * Detecta expedientes activos sin impulso procesal y les abre el plazo de
   * caducidad de instancia (art. 310 CPCCN, 90 días hábiles).
   *
   * Es el complemento del motor de plazos, no un duplicado: generateForCase()
   * reacciona a documentos, y la caducidad se produce justamente cuando NO hay
   * documentos. Sin este timer el riesgo más caro del estudio es el único que
   * el sistema no ve.
   *
   * El umbral de disparo son 80 días hábiles y no 90 a propósito: el plazo se
   * crea 10 días hábiles antes de vencer para que las alertas T10/T5/T2 del
   * chequeo diario tengan margen de correr. La fecha de vencimiento sigue
   * siendo la real (last_activity_at + 90), no la del disparo.
   *
   * Nunca propaga: es un paso oportunista del cron y no debe voltear la corrida
   * de alertas que viene después.
   */
  async checkPassiveCaducidad(): Promise<{ scanned: number; created: number; cleared: number }> {
    const today = toDateString(new Date())
    let scanned = 0
    let created = 0
    let cleared = 0

    try {
      const cases = await this.loadActiveCases()
      scanned = cases.length

      for (const c of cases) {
        try {
          const lastActivity = toDateString(new Date(c.last_activity_at))
          const diasSinActividad = await businessDaysUntil(lastActivity, today, this.holidays.forYear)

          if (diasSinActividad >= CADUCIDAD_TRIGGER_DAYS) {
            if (await this.createCaducidadDeadline(c.id, lastActivity, diasSinActividad)) created++
          } else if (await this.clearCaducidadDeadline(c.id)) {
            cleared++
          }
        } catch (err) {
          this.logger.error(
            `Caducidad pasiva falló para expediente ${c.id}: ${(err as Error).message}`,
          )
        }
      }

      this.logger.log(
        `✓ Caducidad pasiva — ${scanned} expedientes activos, ${created} plazos abiertos, ${cleared} liberados`,
      )
    } catch (err) {
      this.logger.error(`checkPassiveCaducidad failed: ${(err as Error).message}`)
    }

    return { scanned, created, cleared }
  }

  /** Expedientes vivos cuyo estado actual no es terminal. */
  private async loadActiveCases(): Promise<{ id: string; last_activity_at: string }[]> {
    const { data, error } = await this.db
      .from('case_files')
      .select('id, last_activity_at, current_status:workflow_states!inner(is_terminal)')
      .is('deleted_at', null)

    if (error) throw new Error(`Failed to load active cases: ${error.message}`)

    // is_terminal se filtra en memoria por la misma razón que deleted_at en
    // loadPendingDeadlines: filtrar sobre una tabla embebida es frágil.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? [])
      .filter((row: any) => row.current_status && row.current_status.is_terminal === false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => ({ id: row.id, last_activity_at: row.last_activity_at }))
  }

  /** Devuelve true si insertó el plazo; false si ya existía uno pendiente. */
  private async createCaducidadDeadline(
    caseId: string,
    lastActivity: string,
    diasSinActividad: number,
  ): Promise<boolean> {
    const { data: existing, error: qErr } = await this.db
      .from('case_deadlines')
      .select('id')
      .eq('case_file_id', caseId)
      .eq('act_type', 'CADUCIDAD_INSTANCIA')
      .eq('estado', 'PENDIENTE')
      .limit(1)

    if (qErr) throw new Error(`Failed to check existing caducidad: ${qErr.message}`)
    if (existing?.length) return false

    const fechaVencimiento = await addBusinessDays(
      lastActivity,
      CADUCIDAD_DIAS_HABILES,
      this.holidays.forYear,
    )

    const { error: insertErr } = await this.db.from('case_deadlines').insert({
      case_file_id:      caseId,
      act_type:          'CADUCIDAD_INSTANCIA',
      description:       'Impulsar proceso (caducidad de instancia)',
      dias_habiles:      CADUCIDAD_DIAS_HABILES,
      fecha_inicio:      lastActivity,
      fecha_vencimiento: fechaVencimiento,
      estado:            'PENDIENTE',
      tipo:              'FATAL',
      is_auto_generated: true,
      // triggered_by_act es NOT NULL y acá no hay acto del LLM que lo llene.
      // El marcador `source` es además el discriminador que permite borrar solo
      // los plazos que abrió este timer, sin tocar los que extrajo el LLM.
      triggered_by_act: {
        source: PASSIVE_SOURCE,
        act_type: 'CADUCIDAD_INSTANCIA',
        last_activity_at: lastActivity,
        dias_sin_actividad: diasSinActividad,
      },
    })

    // 23505 = la constraint de idempotencia (case_file_id, act_type,
    // fecha_inicio). Dos corridas del cron el mismo día sobre un expediente ya
    // marcado CUMPLIDO caen acá: no es un error, es el guard funcionando.
    if (insertErr) {
      if (insertErr.code === '23505') return false
      throw new Error(`Failed to insert caducidad deadline: ${insertErr.message}`)
    }

    this.logger.warn(
      `⚠ Caducidad pasiva — expediente ${caseId} lleva ${diasSinActividad} días hábiles sin impulso ` +
      `(vence ${fechaVencimiento})`,
    )
    return true
  }

  /**
   * El expediente volvió a moverse: el plazo que abrió el timer ya no describe
   * la realidad y se borra. Solo se tocan los que llevan el marcador `source`
   * — un CADUCIDAD_INSTANCIA extraído de un documento real refleja una
   * intimación del juzgado y sobrevive al impulso.
   */
  private async clearCaducidadDeadline(caseId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('case_deadlines')
      .delete()
      .eq('case_file_id', caseId)
      .eq('act_type', 'CADUCIDAD_INSTANCIA')
      .eq('estado', 'PENDIENTE')
      .eq('is_auto_generated', true)
      .eq('triggered_by_act->>source', PASSIVE_SOURCE)
      .select('id')

    if (error) throw new Error(`Failed to clear caducidad deadline: ${error.message}`)
    if (!data?.length) return false

    this.logger.log(`Caducidad pasiva liberada — expediente ${caseId} fue impulsado`)
    return true
  }

  private async loadPendingDeadlines(): Promise<PendingDeadline[]> {
    const { data, error } = await this.db
      .from('case_deadlines')
      .select(`
        id, description, fecha_vencimiento, case_file_id,
        case_files!inner(case_number, title, caption, responsible_attorney_id, created_by, deleted_at)
      `)
      .eq('estado', 'PENDIENTE')

    if (error) throw new Error(`Failed to load pending deadlines: ${error.message}`)

    // deleted_at se filtra acá y no en la query: los filtros sobre tablas
    // embebidas de PostgREST son frágiles y el volumen de plazos es chico.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? [])
      .filter((row: any) => row.case_files && row.case_files.deleted_at === null)
      .map((row: any) => ({
        id:                row.id,
        description:       row.description,
        fecha_vencimiento: row.fecha_vencimiento,
        case_file_id:      row.case_file_id,
        case_number:       row.case_files.case_number,
        case_title:        row.case_files.title ?? row.case_files.caption ?? null,
        recipient_id:      row.case_files.responsible_attorney_id ?? row.case_files.created_by ?? null,
      }))
  }

  /** Devuelve true si se disparó (y registró) al menos una alerta. */
  private async processDeadline(deadline: PendingDeadline, today: string): Promise<boolean> {
    const remaining = await businessDaysUntil(
      today,
      deadline.fecha_vencimiento,
      this.holidays.forYear,
    )

    const crossed = THRESHOLDS.filter((t) => remaining <= t.days)
    if (crossed.length === 0) return false

    const alreadySent = await this.loadSentAlerts(deadline.id)
    const pending = crossed.filter((t) => !alreadySent.has(t.type))
    if (pending.length === 0) return false

    const mostUrgent = pending[0]

    if (mostUrgent.email) {
      await this.sendDeadlineEmail(deadline, mostUrgent.type, remaining)
    }

    // Se registran todos los umbrales cruzados, no solo el enviado: los menos
    // urgentes ya perdieron sentido y no deben disparar en la próxima corrida.
    await this.recordAlerts(deadline.id, pending.map((t) => t.type))

    this.logger.log(
      `Alerta ${mostUrgent.type} — plazo ${deadline.id} (${deadline.description}, ` +
      `Exp. ${deadline.case_number}, ${remaining} días hábiles restantes)`,
    )
    return true
  }

  private async loadSentAlerts(deadlineId: string): Promise<Set<AlertType>> {
    const { data, error } = await this.db
      .from('deadline_alerts')
      .select('alert_type')
      .eq('deadline_id', deadlineId)

    if (error) throw new Error(`Failed to load sent alerts: ${error.message}`)
    return new Set<AlertType>((data ?? []).map((r: { alert_type: AlertType }) => r.alert_type))
  }

  private async recordAlerts(deadlineId: string, types: AlertType[]): Promise<void> {
    const { error } = await this.db
      .from('deadline_alerts')
      .upsert(
        types.map((alert_type) => ({ deadline_id: deadlineId, alert_type })),
        { onConflict: 'deadline_id,alert_type', ignoreDuplicates: true },
      )

    if (error) throw new Error(`Failed to record alerts: ${error.message}`)
  }

  // ── Email ──────────────────────────────────────────────────────────────────

  private async sendDeadlineEmail(
    deadline: PendingDeadline,
    type: AlertType,
    remaining: number,
  ): Promise<void> {
    if (!deadline.recipient_id) {
      this.logger.warn(`Deadline ${deadline.id} has no recipient — skipping email`)
      return
    }

    const to = await this.resolveEmail(deadline.recipient_id)
    if (!to) {
      this.logger.warn(`No email for user ${deadline.recipient_id} — skipping email`)
      return
    }

    const urgent = type === 'T2'
    const subject = urgent
      ? `🚨 URGENTE — Plazo en 2 días: ${deadline.description} — Exp. ${deadline.case_number}`
      : `⚠️ Plazo próximo: ${deadline.description} — Exp. ${deadline.case_number}`

    await this.sendEmail(to, subject, this.buildHtml(deadline, remaining, urgent))
  }

  private async resolveEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase.admin.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return null
    return data.user.email
  }

  private buildHtml(deadline: PendingDeadline, remaining: number, urgent: boolean): string {
    const link = `${this.appUrl}/cases/${deadline.case_file_id}`
    const accent = urgent ? '#dc2626' : '#d97706'
    const vencimiento = new Date(deadline.fecha_vencimiento + 'T00:00:00')
      .toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

    return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;color:#111">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:${accent}">
    ${urgent ? 'Plazo urgente' : 'Plazo próximo a vencer'}
  </p>
  <h2 style="margin:0 0 16px;font-size:18px">${deadline.description}</h2>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr>
      <td style="padding:4px 16px 4px 0;color:#666">Expediente</td>
      <td style="padding:4px 0;font-weight:600">${deadline.case_number}</td>
    </tr>
    ${deadline.case_title ? `<tr>
      <td style="padding:4px 16px 4px 0;color:#666">Carátula</td>
      <td style="padding:4px 0">${deadline.case_title}</td>
    </tr>` : ''}
    <tr>
      <td style="padding:4px 16px 4px 0;color:#666">Vence</td>
      <td style="padding:4px 0;font-weight:600;color:${accent}">${vencimiento}</td>
    </tr>
    <tr>
      <td style="padding:4px 16px 4px 0;color:#666">Días hábiles restantes</td>
      <td style="padding:4px 0;font-weight:600">${remaining}</td>
    </tr>
  </table>
  <a href="${link}"
     style="display:inline-block;background:#111;color:#fff;text-decoration:none;
            padding:10px 18px;border-radius:6px;font-size:14px;font-weight:500">
    Ver expediente
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#888">
    Generador de Expedientes — alerta automática del motor de plazos.
  </p>
</div>`.trim()
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM_EMAIL

    if (!apiKey || !from) {
      this.logger.warn(`RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping email to ${to}`)
      return
    }

    if (!this.resend) this.resend = new Resend(apiKey)

    const { error } = await this.resend.emails.send({ from, to, subject, html })
    if (error) throw new Error(`Resend failed: ${error.message}`)

    this.logger.log(`Email enviado a ${to} — ${subject}`)
  }
}
