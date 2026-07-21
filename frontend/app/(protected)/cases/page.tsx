import Link from 'next/link'
import { FolderOpen, Search } from 'lucide-react'
import { listCaseFiles } from '@/services/case-file.service'
import { getCurrentUserRole, listUsers } from '@/services/users.service'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Badge } from '@/components/ui/badge'
import { DeleteCaseButton } from '@/components/cases/delete-case-button'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Expedientes — Generador de Expedientes' }

const CLOSED_CODES = new Set(['closed', 'archived'])

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface CasesPageProps {
  searchParams: Promise<{ search?: string }>
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const { search } = await searchParams

  let cases: Awaited<ReturnType<typeof listCaseFiles>>['data'] = []
  let total = 0
  let loadError: string | null = null

  try {
    const result = await listCaseFiles({ page: 1, page_size: 50, search })
    cases = result.data
    total = result.total
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Error al cargar los expedientes.'
  }

  // Socios y admins ven la cartera completa, así que necesitan saber de quién es
  // cada expediente. Un asociado solo ve los propios: la columna sería ruido.
  const role = await getCurrentUserRole()
  const showResponsible = role === 'admin' || role === 'socio'
  const attorneyNames = new Map<string, string>()
  if (showResponsible) {
    try {
      for (const u of await listUsers()) {
        attorneyNames.set(u.id, u.full_name ?? u.email)
      }
    } catch {
      // La columna es informativa — si falla, se muestra "—" en lugar de romper.
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Expedientes</h2>
          <p className="text-sm text-muted-foreground">
            {total} expediente{total !== 1 ? 's' : ''} generado{total !== 1 ? 's' : ''} a partir de documentos procesados.
          </p>
        </div>
      </div>

      {/* ── Search (plain GET form — no client JS needed) ── */}
      <form method="get" className="max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Buscar por número, carátula o juzgado…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </form>

      {loadError && <ErrorState description={loadError} />}

      {!loadError && cases.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title={search ? 'No hay expedientes que coincidan con tu búsqueda' : 'Sin expedientes aún'}
          description={
            search
              ? 'Probá con otro término de búsqueda.'
              : 'Los expedientes se crean automáticamente una vez que los documentos subidos terminan de procesarse.'
          }
        />
      )}

      {!loadError && cases.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Expediente</th>
                <th className="px-4 py-3 font-medium">Juzgado / Jurisdicción</th>
                <th className="px-4 py-3 font-medium">Materia</th>
                {showResponsible && <th className="px-4 py-3 font-medium">Responsable</th>}
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/cases/${c.id}`} className="block">
                      <span className="font-medium text-foreground">{c.case_number}</span>
                      <span className="block max-w-xs truncate text-xs text-muted-foreground">
                        {c.caption}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.court ?? '—'}
                    {c.jurisdiction ? ` · ${c.jurisdiction}` : ''}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.matter ?? '—'}</td>
                  {showResponsible && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.responsible_attorney_id && attorneyNames.get(c.responsible_attorney_id)) ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border-0',
                          CLOSED_CODES.has(c.current_status.code)
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-green-500/15 text-green-700'
                        )}
                      >
                        {c.current_status.label}
                      </Badge>
                      {c.processing_phase !== 'complete' && (
                        <Badge variant="outline" className={cn(
                          'border-0 text-xs',
                          c.processing_phase === 'analyzing'
                            ? 'bg-blue-500/15 text-blue-700'
                            : 'bg-amber-500/15 text-amber-700'
                        )}>
                          {c.processing_phase === 'analyzing' ? 'Analizando…' : 'Vista previa'}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(c.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteCaseButton caseId={c.id} caseNumber={c.case_number} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
