import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Cpu } from 'lucide-react'
import { ApiError } from '@/services/case-file.service'
import { ProcessingDashboard } from '@/components/processing'
import type { ProcessingDocument } from '@/components/processing'

export const metadata = { title: 'Processing — Generador de Expedientes' }

// Revalidate every 5 s so the server-rendered initial state is fresh
export const revalidate = 5

async function getInitialDocs(): Promise<ProcessingDocument[]> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new ApiError('Unauthorized', 401)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('case_file_documents')
      .select(`
        id,
        original_filename,
        file_extension,
        file_size,
        processing_status,
        processing_error,
        processing_error_stage,
        processing_stage_updated_at,
        uploaded_at,
        case_file:case_files ( id, case_number, caption )
      `)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .limit(50)

    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export default async function ProcessingPage() {
  const initialDocs = await getInitialDocs()

  const active    = initialDocs.filter((d) => !['COMPLETED', 'ERROR'].includes(d.processing_status))
  const completed = initialDocs.filter((d) => d.processing_status === 'COMPLETED')
  const errors    = initialDocs.filter((d) => d.processing_status === 'ERROR')

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">

      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <Cpu className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Document Processing</h2>
          <p className="text-sm text-muted-foreground">
            Real-time visibility into the OCR, metadata extraction, and case generation pipeline.
          </p>
        </div>

        {/* Pipeline legend */}
        <div className="ml-auto hidden items-center gap-4 text-xs text-muted-foreground lg:flex">
          {[
            { color: 'bg-muted-foreground/30', label: 'Pending' },
            { color: 'bg-primary',             label: 'Active' },
            { color: 'bg-green-500',            label: 'Done' },
            { color: 'bg-destructive',          label: 'Error' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Quick stats (server-rendered) ── */}
      {initialDocs.length > 0 && (
        <div className="rounded-xl border bg-card px-6 py-4">
          <p className="text-sm text-muted-foreground">
            Monitoring{' '}
            <strong className="text-foreground">{initialDocs.length}</strong> document{initialDocs.length !== 1 ? 's' : ''}
            {active.length > 0 && (
              <> — <strong className="text-primary">{active.length} active</strong></>
            )}
            {errors.length > 0 && (
              <>, <strong className="text-destructive">{errors.length} error{errors.length !== 1 ? 's' : ''}</strong></>
            )}
            {completed.length > 0 && (
              <>, <span className="text-green-700">{completed.length} completed</span></>
            )}
          </p>
        </div>
      )}

      {/* ── Dashboard (client: handles polling + tabs) ── */}
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl border bg-muted/40" />
            ))}
          </div>
        }
      >
        <ProcessingDashboard initialDocs={initialDocs} />
      </Suspense>

    </div>
  )
}
