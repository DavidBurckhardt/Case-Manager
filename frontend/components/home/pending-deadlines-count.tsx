'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

type State = { status: 'loading' } | { status: 'ok'; count: number } | { status: 'error' }

/**
 * Valor de la stat card "Vencimientos Pendientes".
 *
 * Va contra el gateway y no contra Supabase como el resto del dashboard: el
 * criterio de acceso (creador / responsable / alcance de estudio) vive en el
 * backend y no queremos una segunda copia de esa regla acá.
 *
 * 0 y "sin dato" se muestran distinto a propósito — un "—" cuando en realidad
 * no hay vencimientos es exactamente el falso alivio que este MVP evita.
 */
export function PendingDeadlinesCount({ dias = 10 }: { dias?: number }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    apiFetch(`/deadlines/count?dias=${dias}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json() as Promise<{ count: number }>
      })
      .then((body) => {
        if (!cancelled) setState({ status: 'ok', count: body.count ?? 0 })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => { cancelled = true }
  }, [dias])

  if (state.status === 'loading') {
    return <span className="inline-block h-7 w-8 animate-pulse rounded bg-muted" aria-hidden />
  }

  return <>{state.status === 'ok' ? state.count : '—'}</>
}
