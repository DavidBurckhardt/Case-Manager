import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Verificación en dos pasos — Generador de Expedientes' }

type Props = { searchParams: Promise<{ redirectTo?: string }> }

export default async function MfaVerifyPage({ searchParams }: Props) {
  const { redirectTo } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  // Ya verificado en esta sesión — no hay nada que pedir.
  if (aal?.currentLevel === 'aal2') redirect(redirectTo ?? '/dashboard')

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = (factors?.totp ?? []).find((f) => f.status === 'verified')
  // Sin factor verificado no hay segundo paso que completar.
  if (!factor) redirect(redirectTo ?? '/dashboard')

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Verificación en dos pasos</h1>
        <p className="text-sm text-muted-foreground">
          Ingresá el código de tu app de autenticación para continuar
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MfaVerifyForm factorId={factor.id} redirectTo={redirectTo ?? '/dashboard'} />
      </div>
    </div>
  )
}
