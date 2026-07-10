'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Base URL of the NestJS API gateway. All backend calls that have been migrated
 * off the Next.js route handlers go through here.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

/** Current Supabase access token from the browser session, or null. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** fetch() against the API gateway with the Supabase bearer token attached. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(apiUrl(path), { ...init, headers })
}
