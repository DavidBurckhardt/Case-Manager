'use client'

import { useState, useCallback, useRef } from 'react'
import { ALLOWED_MIME_TYPE_LIST, ALLOWED_EXTENSIONS } from '@/constants/storage'
import type { AllowedMimeType } from '@/constants/storage'
import type { UploadFileState, CaseFileDocument } from '@/types/document'

const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB ?? 25)
const MAX_BYTES = MAX_MB * 1024 * 1024

export function validateClientFile(file: File): string | null {
  if (file.size === 0) return 'File is empty.'
  if (file.size > MAX_BYTES) return `File exceeds the ${MAX_MB} MB limit.`
  if (!ALLOWED_MIME_TYPE_LIST.includes(file.type as AllowedMimeType)) {
    return `Unsupported file type. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}.`
  }
  return null
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    xhr.addEventListener('error', () => reject(new Error('Network error.')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')))

    xhr.open('POST', url)
    xhr.send(formData)
  })
}

export interface UseDocumentUploadOptions {
  /** API endpoint that receives the multipart/form-data POST */
  uploadUrl: string
  onUploadComplete?: (documents: CaseFileDocument[]) => void
}

export function useDocumentUpload({ uploadUrl, onUploadComplete }: UseDocumentUploadOptions) {
  const [fileStates, setFileStates] = useState<UploadFileState[]>([])
  // Track abort controllers per file index for future cancellation support
  const abortRefs = useRef<Map<number, AbortController>>(new Map())

  const updateFile = useCallback((index: number, patch: Partial<UploadFileState>) => {
    setFileStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    )
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    const next: UploadFileState[] = incoming.map((file) => {
      const error = validateClientFile(file) ?? undefined
      return { file, status: error ? 'error' : 'pending', progress: 0, error }
    })
    setFileStates((prev) => [...prev, ...next])
  }, [])

  /** Upload a single file at the given queue index. */
  const uploadOne = useCallback(
    async (index: number): Promise<CaseFileDocument | null> => {
      const state = fileStates[index]
      if (!state || state.status !== 'pending') return null

      updateFile(index, { status: 'uploading', progress: 0, error: undefined })

      console.log(`[use-document-upload] uploading "${state.file.name}" (${state.file.size} bytes) → ${uploadUrl}`)

      const formData = new FormData()
      formData.append('files', state.file)

      try {
        const response = await uploadWithProgress(uploadUrl, formData, (pct) => {
          updateFile(index, { progress: pct })
        })

        console.log(`[use-document-upload] "${state.file.name}" response status=${response.status}`)

        if (!response.ok && response.status !== 207) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error ?? `Server error ${response.status}.`)
        }

        const result: { documents: CaseFileDocument[]; errors: { file: string; error: string }[] } =
          await response.json()

        const serverError = result.errors?.find((e) => e.file === state.file.name)
        if (serverError) throw new Error(serverError.error)

        const doc = result.documents?.[0] ?? null
        if (!doc) throw new Error('Upload succeeded but no document was returned.')

        console.log(`[use-document-upload] "${state.file.name}" upload succeeded — documentId=${doc.id}`)
        updateFile(index, { status: 'success', progress: 100, document: doc })
        return doc
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.'
        console.error(`[use-document-upload] "${state.file.name}" upload failed:`, err)
        updateFile(index, { status: 'error', progress: 0, error: message })
        return null
      }
    },
    [fileStates, updateFile, uploadUrl]
  )

  /** Upload all pending files in a single request so the pipeline treats them as one batch. */
  const uploadAll = useCallback(async (): Promise<CaseFileDocument[]> => {
    const pendingIndices = fileStates
      .map((s, i) => (s.status === 'pending' ? i : -1))
      .filter((i) => i >= 0)

    if (!pendingIndices.length) return []

    // Mark all as uploading
    pendingIndices.forEach((i) => updateFile(i, { status: 'uploading', progress: 0, error: undefined }))

    const formData = new FormData()
    pendingIndices.forEach((i) => formData.append('files', fileStates[i].file))

    console.log(`[use-document-upload] uploading ${pendingIndices.length} file(s) as one batch → ${uploadUrl}`)

    try {
      // Track progress against the combined upload
      const response = await uploadWithProgress(uploadUrl, formData, (pct) => {
        pendingIndices.forEach((i) => updateFile(i, { progress: pct }))
      })

      console.log(`[use-document-upload] batch response status=${response.status}`)

      if (!response.ok && response.status !== 207) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error ?? `Server error ${response.status}.`)
      }

      const result: { documents: CaseFileDocument[]; errors: { file: string; error: string }[] } =
        await response.json()

      // Map results back to individual file states
      pendingIndices.forEach((i) => {
        const name = fileStates[i].file.name
        const serverError = result.errors?.find((e) => e.file === name)
        const doc = result.documents?.find((d) => d.original_filename === name)
        if (serverError) {
          updateFile(i, { status: 'error', progress: 0, error: serverError.error })
        } else if (doc) {
          updateFile(i, { status: 'success', progress: 100, document: doc })
        } else {
          updateFile(i, { status: 'error', progress: 0, error: 'No response for this file.' })
        }
      })

      const uploaded = result.documents ?? []
      if (uploaded.length) onUploadComplete?.(uploaded)
      return uploaded
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      console.error(`[use-document-upload] batch upload failed:`, err)
      pendingIndices.forEach((i) => updateFile(i, { status: 'error', progress: 0, error: message }))
      return []
    }
  }, [fileStates, updateFile, uploadUrl, onUploadComplete])

  /** Retry a single failed file. */
  const retryFile = useCallback(
    (index: number) => {
      updateFile(index, { status: 'pending', progress: 0, error: undefined })
    },
    [updateFile]
  )

  const removeFile = useCallback((index: number) => {
    setFileStates((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const reset = useCallback(() => {
    setFileStates([])
    abortRefs.current.clear()
  }, [])

  const pendingCount = fileStates.filter((f) => f.status === 'pending').length
  const isUploading = fileStates.some((f) => f.status === 'uploading')
  const hasErrors = fileStates.some((f) => f.status === 'error')
  const allDone =
    fileStates.length > 0 && fileStates.every((f) => f.status === 'success' || f.status === 'error')

  return {
    fileStates,
    addFiles,
    uploadAll,
    uploadOne,
    retryFile,
    removeFile,
    reset,
    pendingCount,
    isUploading,
    hasErrors,
    allDone,
  }
}
