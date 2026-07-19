'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Props {
  /** Factor TOTP ya verificado, si existe. */
  verifiedFactorId: string | null
}

type Enrolling = { factorId: string; qr: string; secret: string }

export function MfaSetup({ verifiedFactorId }: Props) {
  const router = useRouter()
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startEnroll() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()

      // Un intento anterior abandonado deja un factor sin verificar que hace
      // fallar el enroll por nombre duplicado. Se limpian antes de empezar.
      const { data: factors } = await supabase.auth.mfa.listFactors()
      for (const f of factors?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `authenticator-${Date.now()}`,
      })
      if (enrollError) throw enrollError

      setEnrolling({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la configuración.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!enrolling) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrolling.factorId,
        code: code.trim(),
      })
      if (verifyError) throw verifyError

      setEnrolling(null)
      setCode('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código incorrecto. Probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!verifiedFactorId) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId })
      if (unenrollError) throw unenrollError
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar.')
    } finally {
      setBusy(false)
    }
  }

  // ── Ya configurado ─────────────────────────────────────────────────────────
  if (verifiedFactorId) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Verificación en dos pasos activa</p>
            <p className="mt-0.5 text-xs">
              Al iniciar sesión se te va a pedir el código de tu app de autenticación.
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={disable} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Desactivar
        </Button>
      </div>
    )
  }

  // ── En proceso de enroll ───────────────────────────────────────────────────
  if (enrolling) {
    return (
      <div className="space-y-5">
        <ol className="space-y-4 text-sm">
          <li>
            <p className="font-medium">1. Escaneá el código con tu app de autenticación</p>
            <p className="text-xs text-muted-foreground">Google Authenticator, 1Password, Authy o similar.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolling.qr}
              alt="Código QR para configurar la verificación en dos pasos"
              className="mt-3 h-44 w-44 rounded-lg border bg-white p-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              ¿No podés escanear? Cargá esta clave a mano:{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{enrolling.secret}</code>
            </p>
          </li>
          <li>
            <label htmlFor="mfa-code" className="font-medium">
              2. Ingresá el código de 6 dígitos que muestra la app
            </label>
            <input
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="mt-2 block h-10 w-40 rounded-md border border-input bg-background px-3 font-mono text-lg tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </li>
        </ol>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={confirm} disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Activar
          </Button>
          <Button variant="outline" onClick={() => { setEnrolling(null); setError(null) }} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  // ── Sin configurar ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Tu cuenta no tiene verificación en dos pasos</p>
          <p className="mt-0.5 text-xs">
            Con acceso a expedientes y plazos judiciales, una contraseña sola es poca protección.
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={startEnroll} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Activar verificación en dos pasos
      </Button>
    </div>
  )
}
