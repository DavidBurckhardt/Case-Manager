import { SupabaseStorageProvider } from './supabase.provider'
import type { StorageProvider } from './types'

export type { StorageProvider, StorageUploadParams, StorageUploadResult, StorageSignedUrlResult } from './types'

let _provider: StorageProvider | null = null

/**
 * Returns the active storage provider singleton.
 * Controlled by STORAGE_PROVIDER env var (default: 'supabase').
 * Adding a new provider: implement StorageProvider and add a case below.
 */
export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider

  const name = process.env.STORAGE_PROVIDER ?? 'supabase'

  switch (name) {
    case 'supabase':
      _provider = new SupabaseStorageProvider()
      break
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${name}". Supported: supabase. ` +
        'To add S3/R2/Azure, implement StorageProvider and register it here.'
      )
  }

  return _provider
}
