'use client'

import {
  FileText,
  FileImage,
  FileCode2,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UploadFileState } from '@/types/document'

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType === 'application/pdf') return FileText
  if (mimeType.includes('xml') || mimeType.includes('word')) return FileCode2
  return File
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() ?? ''
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<UploadFileState['status'], string> = {
  pending: 'Listo',
  uploading: 'Subiendo',
  success: 'Subido',
  error: 'Fallido',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UploadFileItemProps {
  state: UploadFileState
  onRemove: () => void
  onRetry?: () => void
}

export function UploadFileItem({ state, onRemove, onRetry }: UploadFileItemProps) {
  const { file, status, progress, error } = state
  const Icon = getFileIcon(file.type)

  const isActive = status === 'uploading'
  const isSuccess = status === 'success'
  const isError = status === 'error'

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors',
        isSuccess && 'border-green-500/30 bg-green-500/5',
        isError && 'border-destructive/30 bg-destructive/5'
      )}
      aria-label={`${file.name} — ${STATUS_LABEL[status]}`}
    >
      {/* File type icon */}
      <div
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
          isSuccess
            ? 'border-green-500/30 bg-green-500/10 text-green-600'
            : isError
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-muted bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* File info + progress */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Name row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {getExtension(file.name)} &middot; {formatBytes(file.size)}
            </p>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              status === 'pending'   && 'bg-muted text-muted-foreground',
              status === 'uploading' && 'bg-blue-500/15 text-blue-600',
              status === 'success'   && 'bg-green-500/15 text-green-600',
              status === 'error'     && 'bg-destructive/15 text-destructive'
            )}
            aria-live="polite"
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* Progress bar */}
        {isActive && (
          <div className="space-y-1" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <Progress value={progress} className="h-1.5" />
            <p className="text-right text-[11px] text-muted-foreground">{progress}%</p>
          </div>
        )}

        {/* Error message */}
        {isError && error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        {isActive && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />
        )}
        {isSuccess && (
          <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
        )}
        {isError && onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRetry}
            aria-label={`Retry upload for ${file.name}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {(status === 'pending' || isError) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRemove}
            aria-label={`Remove ${file.name} from upload queue`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  )
}
