import { AlertCircle, RefreshCw, ShieldOff, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ErrorVariant = 'generic' | 'network' | 'unauthorized' | 'not-found'

const CONFIG: Record<ErrorVariant, { icon: typeof AlertCircle; title: string; description: string }> = {
  generic: {
    icon: AlertCircle,
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
  },
  network: {
    icon: WifiOff,
    title: 'Connection problem',
    description: 'Unable to reach the server. Check your connection and retry.',
  },
  unauthorized: {
    icon: ShieldOff,
    title: 'Access denied',
    description: "You don't have permission to view this resource.",
  },
  'not-found': {
    icon: AlertCircle,
    title: 'Not found',
    description: 'The requested resource could not be found.',
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
          Try again
        </Button>
      )}
    </div>
  )
}
