'use client'

import { useRouter } from 'next/navigation'
import { DocumentUploader } from './document-uploader'
import type { CaseFileDocument } from '@/types/document'

const SESSION_KEY = 'pending-processing-docs'

interface Props {
  uploadUrl: string
  className?: string
}

export function DocumentUploaderWithRedirect({ uploadUrl, className }: Props) {
  const router = useRouter()

  function handleUploadComplete(docs: CaseFileDocument[]) {
    // Stash freshly-uploaded docs so /processing can show them instantly
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(docs))
    } catch { /* private mode or quota exceeded — ignore */ }
    router.push('/processing')
  }

  return (
    <DocumentUploader
      uploadUrl={uploadUrl}
      onUploadComplete={handleUploadComplete}
      className={className}
    />
  )
}
