export interface StorageUploadParams {
  key: string
  body: File | Buffer | Uint8Array
  contentType: string
}

export interface StorageUploadResult {
  key: string
  bucket: string
  provider: string
}

export interface StorageSignedUrlResult {
  url: string
  expiresAt: Date
}

export interface StorageProvider {
  readonly name: string
  readonly bucket: string
  upload(params: StorageUploadParams): Promise<StorageUploadResult>
  getSignedUrl(key: string, expiresInSeconds: number): Promise<StorageSignedUrlResult>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
}
