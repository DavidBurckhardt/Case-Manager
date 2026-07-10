import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Owns the two Supabase clients the API needs:
 *   • admin  — service-role, bypasses RLS, used for all data + storage ops
 *   • anon   — used only to validate an incoming user's JWT
 *
 * Nothing else in the app talks to Supabase directly.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _admin!: SupabaseClient<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _anon!: SupabaseClient<any>

  readonly bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'documents'

  onModuleInit() {
    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.SUPABASE_ANON_KEY

    if (!url || !serviceKey || !anonKey) {
      throw new Error('Missing Supabase env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY')
    }

    this._admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    this._anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    this.logger.log('Supabase clients ready')
  }

  /** Service-role client — bypasses RLS. Server-side only. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get admin(): SupabaseClient<any> {
    return this._admin
  }

  /** Resolve the authenticated user for a bearer token, or null. */
  async getUserFromToken(token: string): Promise<{ id: string; email?: string } | null> {
    const { data, error } = await this._anon.auth.getUser(token)
    if (error || !data?.user) return null
    return { id: data.user.id, email: data.user.email ?? undefined }
  }

  // ── Storage ────────────────────────────────────────────────────────────────

  async uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this._admin.storage
      .from(this.bucket)
      .upload(key, body, { contentType, upsert: false })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)
  }

  async createSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this._admin.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds)
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`)
    return data.signedUrl
  }

  async deleteObject(key: string): Promise<void> {
    await this._admin.storage.from(this.bucket).remove([key])
  }
}
