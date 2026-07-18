'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle, Loader2, Clock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Deadline {
  id: string
  act_type: string
  description: string
  dias_habiles: number
  fecha_inicio: string
  fecha_vencimiento: string
  estado: 'PENDIENTE' | 'CUMPLIDO' | 'VENCIDO'
  tipo: 'FATAL' | 'ORDINARIO'
  is_auto_generated: boolean
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function urgency(deadline: Deadline): 'vencido' | 'urgente' | 'normal' {
  if (deadline.estado === 'VENCIDO') return 'vencido'
  if (deadline.estado === 'CUMPLIDO') return 'normal'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline.fecha_vencimiento + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'vencido'
  if (diffDays <= 5) return 'urgente'
  return 'normal'
}

export function DeadlinesTab({ caseId }: { caseId: string }) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const db = createClient() as any
      const { data, error: qErr } = await db
        .from('case_deadlines')
        .select('id, act_type, description, dias_habiles, fecha_inicio, fecha_vencimiento, estado, tipo, is_auto_generated')
        .eq('case_file_id', caseId)
        .order('fecha_vencimiento', { ascending: true })
      if (qErr) throw new Error(qErr.message)
      setDeadlines(data ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar plazos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [caseId])

  async function markComplete(deadlineId: string) {
    setCompleting(deadlineId)
    try {
      const res = await fetch(`/api/case-files/${caseId}/deadlines/${deadlineId}`, { method: 'PATCH' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Error ${res.status}`)
      }
      startTransition(() => {
        setDeadlines((prev) =>
          prev.map((d) => d.id === deadlineId ? { ...d, estado: 'CUMPLIDO', is_auto_generated: false } : d)
        )
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCompleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">{error}</p>
  }

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <Clock className="h-8 w-8" />
        <p className="text-sm">No hay plazos registrados para este expediente.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acto</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notificación</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencimiento</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Días hábiles</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {deadlines.map((d) => {
            const u = urgency(d)
            return (
              <tr key={d.id} className={cn('transition-colors', d.estado === 'CUMPLIDO' && 'opacity-60')}>
                <td className="px-4 py-3 font-medium">{d.description}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(d.fecha_inicio)}</td>
                <td className={cn('px-4 py-3 tabular-nums font-medium', {
                  'text-destructive': u === 'vencido',
                  'text-amber-600 dark:text-amber-400': u === 'urgente',
                })}>
                  <span className="flex items-center gap-1.5">
                    {u === 'vencido' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    {fmtDate(d.fecha_vencimiento)}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.dias_habiles}</td>
                <td className="px-4 py-3">
                  <DeadlineBadge estado={d.estado} tipo={d.tipo} />
                </td>
                <td className="px-4 py-3 text-right">
                  {d.estado === 'PENDIENTE' && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => markComplete(d.id)}
                      disabled={completing === d.id || isPending}
                      className="gap-1"
                    >
                      {completing === d.id
                        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        : <CheckCircle className="h-3 w-3" aria-hidden />
                      }
                      Cumplido
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DeadlineBadge({ estado, tipo }: { estado: Deadline['estado']; tipo: Deadline['tipo'] }) {
  if (estado === 'CUMPLIDO') {
    return <Badge variant="secondary">Cumplido</Badge>
  }
  if (estado === 'VENCIDO') {
    return <Badge variant="destructive">Vencido</Badge>
  }
  return (
    <Badge variant={tipo === 'FATAL' ? 'default' : 'outline'}>
      {tipo === 'FATAL' ? 'Fatal' : 'Ordinario'}
    </Badge>
  )
}
