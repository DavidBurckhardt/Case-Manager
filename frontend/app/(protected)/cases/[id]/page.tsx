import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, FileText, User, Building2, Shield, AlertTriangle,
  Stethoscope, Scale, Calendar, Files, AlertCircle, Loader2, Eye, Upload,
} from 'lucide-react'
import { getCaseFileById } from '@/services/case-file.service'
import { listCaseFileDocuments } from '@/services/document.service'
import { DocumentUploaderForCase } from '@/components/documents/document-uploader-for-case'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CaseTabs } from '@/components/cases/case-tabs'
import { countOverdueDeadlines } from '@/services/deadlines.service'
import { getCurrentUserRole } from '@/services/users.service'
import { LifecycleBadge } from '@/components/cases/lifecycle-badge'

export const metadata = { title: 'Detalle de Expediente — Generador de Expedientes' }

interface Props { params: Promise<{ id: string }> }

function fmt(v: string | null | undefined) { return v ?? '—' }
function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v)
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DOC_STATUS_LABELS: Record<string, string> = {
  UPLOADED:             'Subido',
  METADATA_EXTRACTION:  'Extrayendo',
  CASE_GENERATION:      'Generando',
  COMPLETED:            'Procesado',
  ERROR:                'Error',
}

const DOC_STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-500/15 text-green-700',
  ERROR:     'bg-destructive/15 text-destructive',
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>
}

function Field({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'col-span-full')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value ?? '—'}</dd>
    </div>
  )
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={i}>
          <span className="inline-block rounded-md border bg-muted/50 px-2 py-0.5 text-xs">{item}</span>
        </li>
      ))}
    </ul>
  )
}

const CONFIDENCE_STYLES: Record<string, string> = {
  High:   'bg-green-500/15 text-green-700',
  Medium: 'bg-amber-500/15 text-amber-700',
  Low:    'bg-destructive/15 text-destructive',
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params

  let caseFile: Awaited<ReturnType<typeof getCaseFileById>>
  try {
    caseFile = await getCaseFileById(id)
  } catch {
    notFound()
  }

  const [overdueCount, role, documents] = await Promise.all([
    countOverdueDeadlines(id),
    getCurrentUserRole(),
    listCaseFileDocuments(id),
  ])
  // Mover el expediente de estado es una decisión procesal: solo socios y admin.
  const canTransition = role === 'admin' || role === 'socio'

  const {
    case_number, title, caption, court, jurisdiction, department,
    process_type, legal_matter, matter, filing_date, claim_amount,
    summary, documents_detected, important_dates, processing_phase,
    current_status, parties, plaintiff, accident, medical,
    insurance, employer, admin_proceedings, created_at,
  } = caseFile

  const safeParties   = Array.isArray(parties) ? parties : []
  const defendants    = safeParties.filter((p) => p.role === 'defendant')
  const lawyers       = safeParties.filter((p) => p.role === 'lawyer')
  const displayTitle  = title || caption || case_number
  const safeDates     = Array.isArray(important_dates) ? important_dates as Array<{ date: string | null; event: string }> : []
  const safeDocs      = Array.isArray(documents_detected) ? documents_detected as string[] : []

  const expedienteContent = (
    <div className="space-y-6">

      {/* ── Processing phase banner ── */}
      {processing_phase !== 'complete' && (
        <div className={cn(
          'flex items-start gap-3 rounded-xl border px-5 py-4',
          processing_phase === 'analyzing'
            ? 'border-blue-200 bg-blue-50 text-blue-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        )}>
          {processing_phase === 'analyzing'
            ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            : <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          }
          <div>
            <p className="text-sm font-semibold">
              {processing_phase === 'analyzing' ? 'Análisis profundo en curso' : 'Vista previa — datos limitados'}
            </p>
            <p className="mt-0.5 text-xs">
              {processing_phase === 'analyzing'
                ? 'La extracción por IA está en curso en segundo plano. Actualizá esta página en unos minutos para ver los datos completos del expediente.'
                : 'Este expediente quedó con datos parciales. Algunos campos pueden estar incompletos o ser imprecisos. Volvé a subir el documento para un análisis completo.'
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      {summary && (
        <section className="rounded-xl border bg-muted/30 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen</p>
          <p className="text-sm leading-relaxed">{summary}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">

        {/* ── Case info ── */}
        <Section icon={Scale} title="Información del Expediente">
          <Grid>
            <Field label="Número de Expediente" value={case_number} />
            <Field label="Estado"               value={current_status.label} />
            <Field label="Fecha de Presentación" value={fmtDate(filing_date)} />
            <Field label="Juzgado"              value={fmt(court)} />
            <Field label="Jurisdicción"         value={fmt(jurisdiction)} />
            <Field label="Departamento"         value={fmt(department)} />
            <Field label="Tipo de Proceso"      value={fmt(process_type)} />
            <Field label="Materia Legal"        value={fmt(legal_matter ?? matter)} />
            <Field label="Monto Reclamado"      value={fmtMoney(claim_amount)} />
            <Field label="Registrado"           value={fmtDate(created_at)} />
          </Grid>
        </Section>

        {/* ── Plaintiff ── */}
        <Section icon={User} title="Demandante">
          {plaintiff ? (
            <Grid>
              <Field label="Nombre Completo"  value={fmt(plaintiff.full_name)} wide />
              <Field label="DNI"              value={fmt(plaintiff.dni)} />
              <Field label="CUIL"             value={fmt(plaintiff.cuil)} />
              <Field label="Fecha de Nacimiento" value={fmtDate(plaintiff.birth_date)} />
              <Field label="Nacionalidad"     value={fmt(plaintiff.nationality)} />
              <Field label="Estado Civil"     value={fmt(plaintiff.marital_status)} />
              <Field label="Dirección"        value={fmt(plaintiff.address)} wide />
              <Field label="Ciudad"           value={fmt(plaintiff.city)} />
              <Field label="Provincia"        value={fmt(plaintiff.province)} />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No se extrajeron datos del demandante.</p>
          )}
        </Section>

        {/* ── Accident ── */}
        <Section icon={AlertTriangle} title="Accidente">
          {accident ? (
            <Grid>
              <Field label="Tipo"             value={fmt(accident.accident_type)} />
              <Field label="Fecha"            value={fmtDate(accident.accident_date)} />
              <Field label="Hora"             value={fmt(accident.accident_time)} />
              <Field label="Lugar"            value={fmt(accident.location)} />
              <Field label="Ciudad"           value={fmt(accident.city)} />
              <Field label="Provincia"        value={fmt(accident.province)} />
              <Field label="Actividad Laboral" value={fmt(accident.work_activity)} wide />
              <Field label="Mecanismo"        value={fmt(accident.mechanism)} wide />
              <Field label="Descripción"      value={fmt(accident.description)} wide />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No se extrajeron datos del accidente.</p>
          )}
        </Section>

        {/* ── Medical ── */}
        <Section icon={Stethoscope} title="Médico">
          {medical ? (
            <div className="space-y-4">
              <Grid>
                <Field label="Incapacidad"      value={fmt(medical.permanent_disability)} />
                <Field label="Daño Psicológico" value={medical.psychological_damage_claimed ? 'Sí' : 'No'} />
                <Field label="Inicio de Licencia" value={fmtDate(medical.medical_leave_start)} />
                <Field label="Alta Médica"      value={fmtDate(medical.medical_discharge_date)} />
              </Grid>
              <div><p className="mb-1.5 text-xs text-muted-foreground">Diagnóstico</p><TagList items={Array.isArray(medical.diagnosis) ? medical.diagnosis : []} /></div>
              <div><p className="mb-1.5 text-xs text-muted-foreground">Partes Afectadas del Cuerpo</p><TagList items={Array.isArray(medical.affected_body_parts) ? medical.affected_body_parts : []} /></div>
              {Array.isArray(medical.surgeries) && medical.surgeries.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Cirugías</p><TagList items={medical.surgeries} /></div>}
              {Array.isArray(medical.treatments) && medical.treatments.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Tratamientos</p><TagList items={medical.treatments} /></div>}
              {Array.isArray(medical.current_limitations) && medical.current_limitations.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Limitaciones Actuales</p><TagList items={medical.current_limitations} /></div>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se extrajeron datos médicos.</p>
          )}
        </Section>

        {/* ── Insurance ── */}
        <Section icon={Shield} title="Aseguradora (ART)">
          {insurance ? (
            <Grid>
              <Field label="Nombre"        value={fmt(insurance.name)} wide />
              <Field label="CUIT"          value={fmt(insurance.cuit)} />
              <Field label="Nro. Siniestro" value={fmt(insurance.claim_number)} />
              <Field label="Nro. Póliza"   value={fmt(insurance.policy_number)} />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No se extrajeron datos de la aseguradora.</p>
          )}
        </Section>

        {/* ── Employer ── */}
        <Section icon={Building2} title="Empleador">
          {employer ? (
            <Grid>
              <Field label="Empresa"   value={fmt(employer.company_name)} wide />
              <Field label="CUIT"      value={fmt(employer.cuit)} />
              <Field label="Actividad" value={fmt(employer.activity)} wide />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No se extrajeron datos del empleador.</p>
          )}
        </Section>
      </div>

      {/* ── Defendants ── */}
      {defendants.length > 0 && (
        <Section icon={Scale} title="Demandados">
          <div className="divide-y">
            {defendants.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  {d.cuit && <p className="text-xs text-muted-foreground">CUIT: {d.cuit}</p>}
                </div>
                {d.party_type && <Badge variant="outline" className="border-0 bg-muted text-xs">{d.party_type}</Badge>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Lawyers ── */}
      {lawyers.length > 0 && (
        <Section icon={Scale} title="Abogados">
          <div className="divide-y">
            {lawyers.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{l.name}</p>
                  {l.notes && <p className="text-xs text-muted-foreground">Mat: {l.notes}</p>}
                </div>
                {l.party_type && <Badge variant="outline" className="border-0 bg-muted text-xs">Representa a: {l.party_type}</Badge>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Administrative proceedings ── */}
      {admin_proceedings && (
        <Section icon={FileText} title="Actuaciones Administrativas">
          <Grid>
            <Field label="Expediente Comisión"  value={fmt(admin_proceedings.medical_commission_case)} />
            <Field label="Comisión Médica"       value={fmt(admin_proceedings.medical_commission)} />
            <Field label="Fecha de Resolución"  value={fmtDate(admin_proceedings.resolution_date)} />
            <Field label="Estado Administrativo" value={fmt(admin_proceedings.administrative_status)} />
            <Field label="Dictamen Médico"       value={fmt(admin_proceedings.medical_opinion)} wide />
          </Grid>
        </Section>
      )}

      {/* ── Important dates ── */}
      {safeDates.length > 0 && (
        <Section icon={Calendar} title="Cronología">
          <ol className="space-y-2">
            {safeDates.map((entry, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium">{entry.event}</p>
                  {entry.date && <p className="text-xs text-muted-foreground">{fmtDate(entry.date)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ── Documents detected ── */}
      {safeDocs.length > 0 && (
        <Section icon={Files} title="Documentos Detectados">
          <TagList items={safeDocs} />
        </Section>
      )}

    </div>
  )

  const documentosContent = (
    <div className="space-y-6">
      <Section icon={Upload} title="Agregar Documentos">
        <p className="mb-3 text-xs text-muted-foreground">
          Los documentos nuevos se adjuntan a este expediente y disparan un nuevo análisis
          por IA sobre el expediente completo.
        </p>
        <DocumentUploaderForCase caseId={id} />
      </Section>

      <Section icon={Files} title={`Documentos del Expediente (${documents.length})`}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este expediente todavía no tiene documentos.</p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.original_filename}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtSize(doc.file_size)} · {fmtDate(doc.uploaded_at)}
                  </p>
                  {doc.processing_error && (
                    <p className="mt-0.5 text-xs text-destructive">{doc.processing_error}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn('shrink-0 border-0 text-xs', DOC_STATUS_STYLES[doc.processing_status] ?? 'bg-muted')}
                >
                  {DOC_STATUS_LABELS[doc.processing_status] ?? doc.processing_status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="space-y-3">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Expedientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold leading-snug">{displayTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Expediente&nbsp;<span className="font-mono font-semibold">{case_number}</span>
              {court && <> · {court}</>}
              {jurisdiction && <> · {jurisdiction}</>}
            </p>
          </div>
          <LifecycleBadge code={current_status.code} label={current_status.label} />
        </div>
      </div>
      {overdueCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-5 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              Este expediente tiene {overdueCount} plazo{overdueCount !== 1 ? 's' : ''} vencido
              {overdueCount !== 1 ? 's' : ''} sin cumplir.
            </p>
            <p className="mt-0.5 text-xs text-destructive/80">
              Revisá la pestaña de Plazos para regularizar la situación.
            </p>
          </div>
        </div>
      )}

      <CaseTabs
        caseId={id}
        expedienteContent={expedienteContent}
        documentosContent={documentosContent}
        currentStatus={{ code: current_status.code, label: current_status.label }}
        canTransition={canTransition}
      />
    </div>
  )
}
