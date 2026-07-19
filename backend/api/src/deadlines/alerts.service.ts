import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { SupabaseService } from '../supabase/supabase.service'
import { HolidaysService } from './holidays.service'
import { businessDaysUntil, toDateString } from './business-days'

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
