import Link from 'next/link'
import { FolderOpen, Search } from 'lucide-react'
import { listCaseFiles } from '@/services/case-file.service'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Badge } from '@/components/ui/badge'
import { DeleteCaseButton } from '@/components/cases/delete-case-button'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Cases — Generador de Expedientes' }

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
    loadError = err instanceof Error ? err.message : 'Failed to load cases.'
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Cases</h2>
          <p className="text-sm text-muted-foreground">
            {total} case{total !== 1 ? 's' : ''} generated from processed documents.
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
            placeholder="Search by case number, caption, or court…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </form>

      {loadError && <ErrorState description={loadError} />}

      {!loadError && cases.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title={search ? 'No cases match your search' : 'No cases yet'}
          description={
            search
              ? 'Try a different search term.'
              : 'Cases are created automatically once uploaded documents finish processing.'
          }
        />
      )}

      {!loadError && cases.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">Court / Jurisdiction</th>
                <th className="px-4 py-3 font-medium">Matter</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
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
                  <td className="px-4 py-3">
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
