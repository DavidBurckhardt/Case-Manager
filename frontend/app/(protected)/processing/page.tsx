import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Cpu } from 'lucide-react'
import { ApiError } from '@/services/case-file.service'
import { ProcessingDashboard } from '@/components/processing'
import type { ProcessingDocument } from '@/components/processing'

export const metadata = { title: 'Procesamiento — Generador de Expedientes' }

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
        case_file:case_files ( id, case_number, caption, processing_phase, phase2_docs_total, phase2_docs_completed )
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

  const active    = initialDocs.filter((d) => !['COMPLETED', 'ERROR'].includes(d.processing_status) || d.case_file?.processing_phase === 'analyzing')
  const completed = initialDocs.filter((d) => d.processing_status === 'COMPLETED' && d.case_file?.processing_phase === 'complete')
  const errors    = initialDocs.filter((d) => d.processing_status === 'ERROR')

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">

      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <Cpu className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Procesamiento de Documentos</h2>
          <p className="text-sm text-muted-foreground">
            Seguimiento en tiempo real del pipeline de extracción por IA y generación de expedientes.
          </p>
        </div>

        {/* Pipeline legend */}
        <div className="ml-auto hidden items-center gap-4 text-xs text-muted-foreground lg:flex">
          {[
            { color: 'bg-muted-foreground/30', label: 'Pendiente' },
            { color: 'bg-primary',             label: 'Activo' },
            { color: 'bg-green-500',            label: 'Listo' },
            { color: 'bg-destructive',          label: 'Error' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>

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
