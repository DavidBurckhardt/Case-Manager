'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Inbox, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProcessingRow, type ProcessingDocument } from './processing-card'
import { isTerminalStatus } from '@/types/document'

type FilterTab = 'active' | 'completed' | 'errors' | 'all'

interface ProcessingDashboardProps {
  initialDocs?: ProcessingDocument[]
}

const FAST_POLL_MS = 3_000
const SLOW_POLL_MS = 15_000

// When case_file is null (join race or failure), treat COMPLETED as still analyzing.
// Mirrors the effectivePhase logic in ProcessingRow.
function docIsFullyDone(doc: ProcessingDocument): boolean {
  if (doc.processing_status !== 'COMPLETED') return false
  const phase = doc.case_file?.processing_phase ?? 'analyzing'
  return phase !== 'analyzing'
}

function allTerminal(docs: ProcessingDocument[]) {
  return docs.every(docIsFullyDone)
}

export function ProcessingDashboard({ initialDocs = [] }: ProcessingDashboardProps) {
  const [docs, setDocs] = useState<ProcessingDocument[]>(initialDocs)
  const [loading, setLoading] = useState(initialDocs.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('active')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCancel = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/processing')
      if (res.ok) {
        const data: ProcessingDocument[] = await res.json()
        setDocs(data)
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    function schedule() {
      const interval = allTerminal(docs) ? SLOW_POLL_MS : FAST_POLL_MS
      timerRef.current = setTimeout(async () => {
        await fetchDocs(true)
        schedule()
      }, interval)
    }
    schedule()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [docs, fetchDocs])

  useEffect(() => {
    if (initialDocs.length === 0) fetchDocs(false)
  }, [fetchDocs, initialDocs.length])

  const active    = docs.filter((d) => !docIsFullyDone(d) && d.processing_status !== 'ERROR')
  const completed = docs.filter((d) => docIsFullyDone(d))
  const errors    = docs.filter((d) => d.processing_status === 'ERROR')

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'active',    label: 'Activos',     count: active.length },
    { key: 'completed', label: 'Completados', count: completed.length },
    { key: 'errors',    label: 'Errores',     count: errors.length },
    { key: 'all',       label: 'Todos',       count: docs.length },
  ]

  const visible = filter === 'active'    ? active
                : filter === 'completed' ? completed
                : filter === 'errors'    ? errors
                : docs

  const isPollingFast = !allTerminal(docs) && docs.length > 0

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filtrar documentos" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                filter === key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  key === 'errors'   ? 'bg-destructive/15 text-destructive'
                  : key === 'active' ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isPollingFast && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              En vivo
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Actualizado {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fetchDocs(false)}
            disabled={refreshing}
            aria-label="Actualizar ahora"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ── Summary row ── */}
      {docs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Activos</p>
              <p className="text-lg font-bold leading-none">{active.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Completados</p>
              <p className="text-lg font-bold leading-none">{completed.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Errores</p>
              <p className="text-lg font-bold leading-none">{errors.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Document list ── */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              {filter === 'active'      ? 'Sin documentos en procesamiento'
               : filter === 'errors'   ? 'Sin errores de procesamiento'
               : filter === 'completed'? 'Sin documentos completados aún'
               : 'Sin documentos'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === 'active'
                ? 'Subí documentos desde la pantalla principal para comenzar.'
                : 'Cambiá de pestaña para ver los documentos.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-28" />
              <col className="w-72" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Tamaño</th>
                <th className="px-4 py-3 font-medium">Subido</th>
                <th className="px-4 py-3 font-medium">Progreso</th>
                <th className="px-4 py-3 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <ProcessingRow key={doc.id} doc={doc} onCancel={handleCancel} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
