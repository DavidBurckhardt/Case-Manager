import { cn } from '@/lib/utils'

/**
 * Color por categoría procesal, no por estado individual: azul = trámite en
 * curso, verde = terminó bien (cerrado / acuerdo), rojo = terminó mal
 * (caducidad, la instancia se perdió).
 */
const STATE_STYLES: Record<string, string> = {
  CADUCIDAD: 'border-destructive/30 bg-destructive/10 text-destructive',
  ACUERDO:   'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  CERRADO:   'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  REBELDE:   'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

const ACTIVE_STYLE = 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'

export function LifecycleBadge({
  code,
  label,
  className,
}: {
  code: string
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        STATE_STYLES[code] ?? ACTIVE_STYLE,
        className,
      )}
    >
      {label}
    </span>
  )
}
