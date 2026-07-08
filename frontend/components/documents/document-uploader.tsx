'use client'

import { useDocumentUpload } from '@/hooks/use-document-upload'
import { UploadDropZone } from './upload-drop-zone'
import { UploadFileItem } from './upload-file-item'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaseFileDocument } from '@/types/document'

export interface DocumentUploaderProps {
  /**
   * The API endpoint that accepts multipart/form-data with field "files".
   * Example: `/api/case-files/${caseFileId}/documents`
   */
  uploadUrl: string
  onUploadComplete?: (documents: CaseFileDocument[]) => void
  /** Compact mode: smaller drop zone, ideal for embedding inside a detail panel */
  compact?: boolean
  className?: string
}

export function DocumentUploader({
  uploadUrl,
  onUploadComplete,
  compact = false,
  className,
}: DocumentUploaderProps) {
  const {
    fileStates,
    addFiles,
    uploadAll,
    retryFile,
    removeFile,
    reset,
    pendingCount,
    isUploading,
    allDone,
  } = useDocumentUpload({ uploadUrl, onUploadComplete })

  const hasFiles = fileStates.length > 0
  const successCount = fileStates.filter((f) => f.status === 'success').length
  const errorCount = fileStates.filter((f) => f.status === 'error').length

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone — always visible so users can add more files */}
      <UploadDropZone onFiles={addFiles} disabled={isUploading} compact={compact} />

      {/* Upload queue */}
      {hasFiles && (
        <section aria-label="Upload queue">
          {/* Summary row */}
          {allDone && (
            <div
              className={cn(
                'mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                errorCount > 0
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              )}
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {successCount} file{successCount !== 1 ? 's' : ''} uploaded
                {errorCount > 0 && `, ${errorCount} failed`}.
              </span>
            </div>
          )}

          <ul className="space-y-2" aria-label="Files in upload queue">
            {fileStates.map((state, i) => (
              <UploadFileItem
                key={`${state.file.name}-${state.file.size}-${i}`}
                state={state}
                onRemove={() => removeFile(i)}
                onRetry={() => retryFile(i)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Action bar */}
      {hasFiles && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={isUploading}
          >
            Clear all
          </Button>

          <div className="flex items-center gap-2">
            {allDone && errorCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {errorCount} file{errorCount !== 1 ? 's' : ''} failed — retry or remove them.
              </span>
            )}
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={uploadAll}
              disabled={pendingCount === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount !== 1 ? 's' : ''}` : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
