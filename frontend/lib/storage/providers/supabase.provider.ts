import { createAdminClient } from '@/lib/supabase/admin'
import { STORAGE_BUCKET, SIGNED_URL_EXPIRY_SECONDS } from '@/constants/storage'
import type {
  StorageProvider,
  StorageUploadParams,
  StorageUploadResult,
  StorageSignedUrlResult,
} from './types'

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase' as const
  readonly bucket: string

  constructor(bucket = STORAGE_BUCKET) {
    this.bucket = bucket
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const supabase = createAdminClient()

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(params.key, params.body, {
        contentType: params.contentType,
        upsert: false,   // immutability: reject if key already exists
      })

    if (error) {
      console.error(`[SupabaseStorage] Upload failed — key=${params.key} bucket=${this.bucket}:`, error)
      throw new Error(`[SupabaseStorage] Upload failed: ${error.message}`)
    }

    return { key: data.path, bucket: this.bucket, provider: this.name }
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS
  ): Promise<StorageSignedUrlResult> {
    const supabase = createAdminClient()

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds)

    if (error || !data) {
      throw new Error(`[SupabaseStorage] Signed URL failed: ${error?.message}`)
    }

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    }
  }

  async delete(key: string): Promise<void> {
    return this.deleteMany([key])
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!keys.length) return
    const supabase = createAdminClient()
    const { error } = await supabase.storage.from(this.bucket).remove(keys)
    if (error) throw new Error(`[SupabaseStorage] Delete failed: ${error.message}`)
  }
}
