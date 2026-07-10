import { AlertCircle, RefreshCw, ShieldOff, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ErrorVariant = 'generic' | 'network' | 'unauthorized' | 'not-found'

const CONFIG: Record<ErrorVariant, { icon: typeof AlertCircle; title: string; description: string }> = {
  generic: {
    icon: AlertCircle,
    title: 'Algo salió mal',
    description: 'Ocurrió un error inesperado. Por favor, intentá de nuevo.',
  },
  network: {
    icon: WifiOff,
    title: 'Problema de conexión',
    description: 'No se pudo conectar al servidor. Verificá tu conexión y reintentá.',
  },
  unauthorized: {
    icon: ShieldOff,
    title: 'Acceso denegado',
    description: 'No tenés permiso para ver este recurso.',
  },
  'not-found': {
    icon: AlertCircle,
    title: 'No encontrado',
    description: 'No se pudo encontrar el recurso solicitado.',
  },
}

interface ErrorStateProps {
  variant?: ErrorVariant
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  variant = 'generic',
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const { icon: Icon, title: defaultTitle, description: defaultDesc } = CONFIG[variant]

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title ?? defaultTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description ?? defaultDesc}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Intentar de nuevo
        </Button>
      )}
    </div>
  )
}
