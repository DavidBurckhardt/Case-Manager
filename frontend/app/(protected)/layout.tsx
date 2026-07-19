import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // El gate del segundo factor vive en proxy.ts — acá solo se decide si mostrar
  // el aviso. MFA es opcional en el MVP: sin factor enrolado se advierte en el
  // header en lugar de bloquear, para no dejar afuera a los usuarios actuales.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const mfaEnabled = aal?.nextLevel === 'aal2'

  // Fetch role from public.users for nav visibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <AppShell
      userEmail={user.email}
      userRole={(profile as { role?: string } | null)?.role ?? 'asociado'}
      mfaEnabled={mfaEnabled}
    >
      {children}
    </AppShell>
  )
}
