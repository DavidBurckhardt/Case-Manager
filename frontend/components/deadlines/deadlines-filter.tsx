'use client'

import { useRouter } from 'next/navigation'

const OPTIONS = [
  { label: 'Hoy',           dias: 0 },
  { label: 'Esta semana',   dias: 7 },
  { label: 'Próximos 15 días', dias: 15 },
  { label: 'Próximos 30 días', dias: 30 },
  { label: 'Todos',         dias: undefined },
] as const

export function DeadlinesFilter({ dias }: { dias?: number }) {
  const router = useRouter()
  const value = dias != null ? String(dias) : ''

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        router.push(v !== '' ? `/deadlines?dias=${v}` : '/deadlines')
      }}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {OPTIONS.map((o) => (
        <option key={o.label} value={o.dias != null ? String(o.dias) : ''}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
