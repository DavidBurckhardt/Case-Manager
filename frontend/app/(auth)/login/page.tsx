import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Iniciar sesión — Generador de Expedientes',
}

type Props = {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { redirectTo, error } = await searchParams

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Generador de Expedientes</h1>
        <p className="text-sm text-muted-foreground">Ingresá tu usuario y contraseña para continuar</p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {error === 'auth_callback_failed' && (
          <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Error de autenticación. Por favor, intentá de nuevo.
          </p>
        )}
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  )
}
