'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth'

export function MfaVerifyForm({ factorId, redirectTo }: { factorId: string; redirectTo: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      })
      if (verifyError) throw verifyError

      // El nivel de la sesión pasa a aal2; el layout deja de redirigir acá.
      router.replace(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="code" className="text-sm font-medium">
          Código de verificación
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="mt-2 block h-11 w-full rounded-md border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Abrí tu app de autenticación y copiá el código de 6 dígitos.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Verificar
      </Button>

      <button
        type="button"
        onClick={() => signOut()}
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Cerrar sesión
      </button>
    </form>
  )
}
