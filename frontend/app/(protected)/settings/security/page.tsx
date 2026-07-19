import { createClient } from '@/lib/supabase/server'
import { MfaSetup } from '@/components/settings/mfa-setup'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Seguridad — Generador de Expedientes' }

export default async function SecurityPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const verified = (data?.totp ?? []).find((f) => f.status === 'verified') ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Seguridad</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Verificación en dos pasos (TOTP) para tu cuenta.
        </p>
      </div>

      <MfaSetup verifiedFactorId={verified?.id ?? null} />
    </div>
  )
}
