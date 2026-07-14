import { FolderOpen, FileText, ChevronDown, ExternalLink, Inbox } from 'lucide-react'
import { listCasesWithDocuments } from '@/services/document.service'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Documentos — Generador de Expedientes' }

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatSize(bytes: number | null | undefined) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentsPage() {
  let cases: Awaited<ReturnType<typeof listCasesWithDocuments>> = []
  let loadError: string | null = null

  try {
    cases = await listCasesWithDocuments()
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Error al cargar los documentos.'
  }

  const withDocs = cases.filter((c) => c.documents.length > 0)
  const totalDocs = withDocs.reduce((acc, c) => acc + c.documents.length, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Documentos</h2>
          <p className="text-sm text-muted-foreground">
            {totalDocs} documento{totalDocs !== 1 ? 's' : ''} en {withDocs.length} expediente{withDocs.length !== 1 ? 's' : ''}. Seleccioná un expediente para ver sus documentos.
          </p>
        </div>
      </div>

      {loadError && <ErrorState description={loadError} />}

      {!loadError && withDocs.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Sin documentos"
          description="Subí documentos desde el Panel para que aparezcan aquí, agrupados por expediente."
        />
      )}

      {/* ── Case accordion ── */}
      <div className="space-y-3">
        {withDocs.map((c) => (
          <details key={c.id ?? 'orphans'} className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {c.title ?? c.caption ?? c.case_number}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{c.case_number}</span>
                  {c.created_at && <> · Registrado el {formatDate(c.created_at)}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                  {c.documents.length} doc{c.documents.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </div>
            </summary>

            <ul className="divide-y border-t">
              {c.documents.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={`/documents/${doc.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.original_filename}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className={cn('uppercase')}>{doc.file_extension}</span>
                          {' · '}{formatSize(doc.file_size)}
                          {' · '}Subido el {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
