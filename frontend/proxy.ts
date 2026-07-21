import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/confirm']

/** Ruta del segundo factor: requiere sesión, pero no un aal2 ya completado. */
const MFA_VERIFY_ROUTE = '/mfa-verify'

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: always call getUser() to refresh the session token
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect authenticated users away from auth pages
  if (user && isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect unauthenticated users to login, preserving the intended destination
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Segundo factor pendiente. El chequeo va acá y no en el layout de (protected)
  // porque las route handlers de /api no pasan por ese layout: una sesión aal1
  // podría llamarlas igual.
  //
  // nextLevel === 'aal2' significa que el usuario TIENE un factor verificado; si
  // currentLevel sigue en 'aal1', entró con contraseña pero no completó el
  // segundo paso. Ambos valores salen de los claims del JWT — no hay red acá.
  if (user && !isPublicRoute(pathname) && pathname !== MFA_VERIFY_ROUTE) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
      const verifyUrl = new URL(MFA_VERIFY_ROUTE, request.url)
      verifyUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(verifyUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
