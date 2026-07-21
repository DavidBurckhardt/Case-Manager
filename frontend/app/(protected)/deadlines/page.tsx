import Link from 'next/link'
import { Clock, AlertTriangle } from 'lucide-react'
import { listUpcomingDeadlines } from '@/services/deadlines.service'
import { DeadlinesFilter } from '@/components/deadlines/deadlines-filter'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Vencimientos — Generador de Expedientes' }

interface Props {
  searchParams: Promise<{ dias?: string }>
}


function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function urgency(fechaVencimiento: string, estado: string): 'vencido' | 'urgente' | 'normal' {
  if (estado === 'VENCIDO') return 'vencido'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(fechaVencimiento + 'T00:00:00')
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
  if (diff <= 0) return 'vencido'
  if (diff <= 5) return 'urgente'
  return 'normal'
}

export default async function DeadlinesPage({ searchParams }: Props) {
  const { dias: diasParam } = await searchParams
  const dias = diasParam != null ? parseInt(diasParam, 10) : undefined

  let deadlines: Awaited<ReturnType<typeof listUpcomingDeadlines>> = []
  let loadError: string | null = null

  try {
    deadlines = await listUpcomingDeadlines({ dias, estado: 'PENDIENTE' })
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Error al cargar vencimientos.'
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10">
          <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Vencimientos</h2>
          <p className="text-sm text-muted-foreground">
            Plazos pendientes de toda tu cartera, ordenados por fecha de vencimiento.
          </p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Mostrar:</span>
        <DeadlinesFilter dias={dias} />
      </div>

      {/* ── Error ── */}
      {loadError && (
        <p className="text-sm text-destructive">{loadError}</p>
      )}

      {/* ── Empty ── */}
      {!loadError && deadlines.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
          <Clock className="h-8 w-8" />
          <p className="text-sm">No hay plazos próximos en tu cartera.</p>
        </div>
      )}

      {/* ── Tabla ── */}
      {!loadError && deadlines.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Expediente</th>
                <th className="px-4 py-3 font-medium">Plazo</th>
                <th className="px-4 py-3 font-medium">Notificación</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.map((d) => {
                const u = urgency(d.fecha_vencimiento, d.estado)
                const displayCase = d.title || d.caption || d.case_number
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/cases/${d.case_file_id}`} className="block">
                        <span className="font-mono font-semibold text-foreground">{d.case_number}</span>
                        <span className="block max-w-xs truncate text-xs text-muted-foreground">
                          {displayCase !== d.case_number ? displayCase : ''}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{d.description}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(d.fecha_inicio)}</td>
                    <td className={cn('px-4 py-3 tabular-nums font-medium', {
                      'text-destructive': u === 'vencido',
                      'text-amber-600 dark:text-amber-400': u === 'urgente',
                    })}>
                      <span className="flex items-center gap-1.5">
                        {u !== 'normal' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                        {fmtDate(d.fecha_vencimiento)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.estado === 'VENCIDO'
                        ? <Badge variant="destructive">Vencido</Badge>
                        : <Badge variant={d.tipo === 'FATAL' ? 'default' : 'outline'}>
                            {d.tipo === 'FATAL' ? 'Fatal' : 'Ordinario'}
                          </Badge>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
