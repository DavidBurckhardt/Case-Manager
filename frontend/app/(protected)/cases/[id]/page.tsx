import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, FileText, User, Building2, Shield, AlertTriangle,
  Stethoscope, Scale, Calendar, Files, AlertCircle, Loader2, Eye,
} from 'lucide-react'
import { getCaseFileById } from '@/services/case-file.service'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Case Detail — Generador de Expedientes' }

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

  const {
    case_number, title, caption, court, jurisdiction, department,
    process_type, legal_matter, matter, filing_date, claim_amount,
    summary, confidence_overall, confidence_missing_fields,
    documents_detected, important_dates, processing_phase,
    current_status, parties, plaintiff, accident, medical,
    insurance, employer, admin_proceedings, created_at,
  } = caseFile

  const safeParties   = Array.isArray(parties) ? parties : []
  const defendants    = safeParties.filter((p) => p.role === 'defendant')
  const lawyers       = safeParties.filter((p) => p.role === 'lawyer')
  const displayTitle  = title || caption || case_number
  const safeDates     = Array.isArray(important_dates) ? important_dates as Array<{ date: string | null; event: string }> : []
  const safeDocs      = Array.isArray(documents_detected) ? documents_detected as string[] : []
  const safeMissing   = Array.isArray(confidence_missing_fields) ? confidence_missing_fields as string[] : []

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">

      {/* ── Back + header ── */}
      <div className="space-y-3">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Cases
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
          <div className="flex items-center gap-2 flex-wrap">
            {confidence_overall && (
              <Badge variant="outline" className={cn('border-0 text-xs', CONFIDENCE_STYLES[confidence_overall])}>
                Confidence: {confidence_overall}
              </Badge>
            )}
            <Badge variant="outline" className="border-0 bg-green-500/15 text-green-700 text-xs">
              {current_status.label}
            </Badge>
          </div>
        </div>
      </div>

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
              {processing_phase === 'analyzing' ? 'Deep analysis in progress' : 'Preview — limited data'}
            </p>
            <p className="mt-0.5 text-xs">
              {processing_phase === 'analyzing'
                ? 'OCR and AI extraction are running in the background. Refresh this page in a few minutes to see the full case data.'
                : 'This case was created from a quick text scan. Some fields may be missing or inaccurate. Re-upload the document with the OCR service running for a full analysis.'
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      {summary && (
        <section className="rounded-xl border bg-muted/30 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
          <p className="text-sm leading-relaxed">{summary}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">

        {/* ── Case info ── */}
        <Section icon={Scale} title="Case Information">
          <Grid>
            <Field label="Case Number"   value={case_number} />
            <Field label="Status"        value={current_status.label} />
            <Field label="Filing Date"   value={fmtDate(filing_date)} />
            <Field label="Court"         value={fmt(court)} />
            <Field label="Jurisdiction"  value={fmt(jurisdiction)} />
            <Field label="Department"    value={fmt(department)} />
            <Field label="Process Type"  value={fmt(process_type)} />
            <Field label="Legal Matter"  value={fmt(legal_matter ?? matter)} />
            <Field label="Claim Amount"  value={fmtMoney(claim_amount)} />
            <Field label="Registered"    value={fmtDate(created_at)} />
          </Grid>
        </Section>

        {/* ── Plaintiff ── */}
        <Section icon={User} title="Plaintiff">
          {plaintiff ? (
            <Grid>
              <Field label="Full Name"       value={fmt(plaintiff.full_name)} wide />
              <Field label="DNI"             value={fmt(plaintiff.dni)} />
              <Field label="CUIL"            value={fmt(plaintiff.cuil)} />
              <Field label="Date of Birth"   value={fmtDate(plaintiff.birth_date)} />
              <Field label="Nationality"     value={fmt(plaintiff.nationality)} />
              <Field label="Marital Status"  value={fmt(plaintiff.marital_status)} />
              <Field label="Address"         value={fmt(plaintiff.address)} wide />
              <Field label="City"            value={fmt(plaintiff.city)} />
              <Field label="Province"        value={fmt(plaintiff.province)} />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No plaintiff data extracted.</p>
          )}
        </Section>

        {/* ── Accident ── */}
        <Section icon={AlertTriangle} title="Accident">
          {accident ? (
            <Grid>
              <Field label="Type"          value={fmt(accident.accident_type)} />
              <Field label="Date"          value={fmtDate(accident.accident_date)} />
              <Field label="Time"          value={fmt(accident.accident_time)} />
              <Field label="Location"      value={fmt(accident.location)} />
              <Field label="City"          value={fmt(accident.city)} />
              <Field label="Province"      value={fmt(accident.province)} />
              <Field label="Work Activity" value={fmt(accident.work_activity)} wide />
              <Field label="Mechanism"     value={fmt(accident.mechanism)} wide />
              <Field label="Description"   value={fmt(accident.description)} wide />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No accident data extracted.</p>
          )}
        </Section>

        {/* ── Medical ── */}
        <Section icon={Stethoscope} title="Medical">
          {medical ? (
            <div className="space-y-4">
              <Grid>
                <Field label="Disability"          value={fmt(medical.permanent_disability)} />
                <Field label="Psych. Damage"       value={medical.psychological_damage_claimed ? 'Yes' : 'No'} />
                <Field label="Leave Start"          value={fmtDate(medical.medical_leave_start)} />
                <Field label="Medical Discharge"    value={fmtDate(medical.medical_discharge_date)} />
              </Grid>
              <div><p className="mb-1.5 text-xs text-muted-foreground">Diagnosis</p><TagList items={Array.isArray(medical.diagnosis) ? medical.diagnosis : []} /></div>
              <div><p className="mb-1.5 text-xs text-muted-foreground">Affected Body Parts</p><TagList items={Array.isArray(medical.affected_body_parts) ? medical.affected_body_parts : []} /></div>
              {Array.isArray(medical.surgeries) && medical.surgeries.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Surgeries</p><TagList items={medical.surgeries} /></div>}
              {Array.isArray(medical.treatments) && medical.treatments.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Treatments</p><TagList items={medical.treatments} /></div>}
              {Array.isArray(medical.current_limitations) && medical.current_limitations.length > 0 && <div><p className="mb-1.5 text-xs text-muted-foreground">Current Limitations</p><TagList items={medical.current_limitations} /></div>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No medical data extracted.</p>
          )}
        </Section>

        {/* ── Insurance ── */}
        <Section icon={Shield} title="Insurance (ART)">
          {insurance ? (
            <Grid>
              <Field label="Name"         value={fmt(insurance.name)} wide />
              <Field label="CUIT"         value={fmt(insurance.cuit)} />
              <Field label="Claim No."    value={fmt(insurance.claim_number)} />
              <Field label="Policy No."   value={fmt(insurance.policy_number)} />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No insurance data extracted.</p>
          )}
        </Section>

        {/* ── Employer ── */}
        <Section icon={Building2} title="Employer">
          {employer ? (
            <Grid>
              <Field label="Company"  value={fmt(employer.company_name)} wide />
              <Field label="CUIT"     value={fmt(employer.cuit)} />
              <Field label="Activity" value={fmt(employer.activity)} wide />
            </Grid>
          ) : (
            <p className="text-sm text-muted-foreground">No employer data extracted.</p>
          )}
        </Section>
      </div>

      {/* ── Defendants ── */}
      {defendants.length > 0 && (
        <Section icon={Scale} title="Defendants">
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
        <Section icon={Scale} title="Lawyers">
          <div className="divide-y">
            {lawyers.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{l.name}</p>
                  {l.notes && <p className="text-xs text-muted-foreground">Reg: {l.notes}</p>}
                </div>
                {l.party_type && <Badge variant="outline" className="border-0 bg-muted text-xs">Representing: {l.party_type}</Badge>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Administrative proceedings ── */}
      {admin_proceedings && (
        <Section icon={FileText} title="Administrative Proceedings">
          <Grid>
            <Field label="Commission Case"  value={fmt(admin_proceedings.medical_commission_case)} />
            <Field label="Commission"       value={fmt(admin_proceedings.medical_commission)} />
            <Field label="Resolution Date"  value={fmtDate(admin_proceedings.resolution_date)} />
            <Field label="Admin Status"     value={fmt(admin_proceedings.administrative_status)} />
            <Field label="Medical Opinion"  value={fmt(admin_proceedings.medical_opinion)} wide />
          </Grid>
        </Section>
      )}

      {/* ── Important dates ── */}
      {safeDates.length > 0 && (
        <Section icon={Calendar} title="Timeline">
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
        <Section icon={Files} title="Documents Detected">
          <TagList items={safeDocs} />
        </Section>
      )}

      {/* ── Missing fields ── */}
      {safeMissing.length > 0 && (
        <Section icon={AlertCircle} title="Missing Fields">
          <div className="flex flex-wrap gap-1.5">
            {safeMissing.map((f, i) => (
              <span key={i} className="inline-block rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                {f}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
