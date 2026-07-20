'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Bot, History, Loader2, User as UserIcon } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { LifecycleBadge } from '@/components/cases/lifecycle-badge'

interface Transition {
  id: string
  trigger_type: 'AUTO' | 'MANUAL'
  triggered_by_name: string | null
  justification: string | null
  source_act_type: string | null
  document_ref: string | null
  created_at: string
  from_state: { code: string; label: string } | null
  to_state: { code: string; label: string }
}

interface WorkflowState {
  code: string
  label: string
  description: string | null
  is_terminal: boolean
  allowed_transitions: string[]
}

interface Props {
  caseId: string
  currentStatus: { code: string; label: string }
  canTransition: boolean
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function LifecycleTab({ caseId, currentStatus, canTransition }: Props) {
  const router = useRouter()
  const [history, setHistory] = useState<Transition[]>([])
  const [states, setStates] = useState<WorkflowState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [target, setTarget] = useState<WorkflowState | null>(null)
  const [justification, setJustification] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Ningún setState antes del primer await: hacerlo de forma síncrona dentro
  // del efecto dispara renders en cascada (react-hooks/set-state-in-effect).
  // `loading` ya arranca en true, así que no hace falta re-activarlo acá; al
  // recargar tras una transición, el spinner del modal cubre la espera.
  const load = useCallback(async () => {
    try {
      const [hRes, sRes] = await Promise.all([
        apiFetch(`/cases/${caseId}/lifecycle/history`),
        apiFetch('/workflow-states'),
      ])
      if (!hRes.ok) throw new Error(`Error ${hRes.status} al cargar el historial`)
      if (!sRes.ok) throw new Error(`Error ${sRes.status} al cargar los estados`)
      const [historyData, statesData] = await Promise.all([hRes.json(), sRes.json()])
      setHistory(historyData)
      setStates(statesData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el ciclo de vida.')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => { load() }, [load])

  const currentState = states.find((s) => s.code === currentStatus.code)
  const nextStates = (currentState?.allowed_transitions ?? [])
    .map((code) => states.find((s) => s.code === code))
    .filter((s): s is WorkflowState => !!s)

  async function confirmTransition() {
    if (!target) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await apiFetch(`/cases/${caseId}/lifecycle/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_state_code: target.code, justification }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? `Error ${res.status}`)
      }
      setTarget(null)
      setJustification('')
      await load()
      // El badge del header lo renderiza el server component de la ficha.
      router.refresh()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'No se pudo aplicar la transición.')
    } finally {
      setSubmitting(false)
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

  return (
    <div className="space-y-6">

      {/* ── Estado actual + acciones ── */}
      <section className="rounded-xl border bg-card px-5 py-4">
        <p className="text-xs text-muted-foreground">Estado actual</p>
        <div className="mt-2">
          <LifecycleBadge code={currentStatus.code} label={currentStatus.label} />
        </div>
        {currentState?.description && (
          <p className="mt-2 text-xs text-muted-foreground">{currentState.description}</p>
        )}

        {canTransition && (
          nextStates.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Cambiar estado a</p>
              <div className="flex flex-wrap gap-2">
                {nextStates.map((s) => (
                  <Button
                    key={s.code}
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => { setTarget(s); setJustification(''); setSubmitError(null) }}
                  >
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
              {currentState?.is_terminal
                ? 'Estado terminal: el expediente no admite más transiciones.'
                : 'No hay transiciones disponibles desde este estado.'}
            </p>
          )
        )}
      </section>

      {/* ── Timeline ── */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Historial de estados</h3>
        </div>

        <div className="px-5 py-4">
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay cambios de estado registrados.
            </p>
          ) : (
            <ol className="relative space-y-5 border-l pl-6">
              {history.map((t) => (
                <li key={t.id} className="relative">
                  <span
                    className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background"
                    aria-hidden
                  >
                    {t.trigger_type === 'AUTO'
                      ? <Bot className="h-2.5 w-2.5 text-muted-foreground" />
                      : <UserIcon className="h-2.5 w-2.5 text-muted-foreground" />}
                  </span>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {t.from_state
                      ? <span className="text-muted-foreground">{t.from_state.label}</span>
                      : <span className="text-muted-foreground">Alta del expediente</span>}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="font-medium">{t.to_state.label}</span>
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDateTime(t.created_at)}
                    {' · '}
                    {t.trigger_type === 'AUTO'
                      ? `Automático${t.source_act_type ? ` (${t.source_act_type})` : ''}`
                      : `Manual — ${t.triggered_by_name ?? 'usuario desconocido'}`}
                    {t.document_ref && ` · ${t.document_ref}`}
                  </p>

                  {t.justification && (
                    <p className="mt-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      {t.justification}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ── Modal de transición manual ── */}
      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado a &laquo;{target?.label}&raquo;</DialogTitle>
            <DialogDescription>
              El cambio queda registrado en el historial del expediente junto con tu justificación.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="justification" className="text-xs font-medium">
              Justificación <span className="text-destructive">*</span>
            </label>
            <textarea
              id="justification"
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ej.: Cédula de notificación diligenciada el 12/03, consta en el expediente digital."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={confirmTransition} disabled={submitting || !justification.trim()} className="gap-1.5">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Confirmar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
