'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText, FileImage, FileCode2, File,
  CheckCircle2, XCircle, Loader2, Clock,
  ExternalLink, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ProcessingPipelineTrack } from './processing-pipeline-track'
import type { DocumentProcessingStatus } from '@/types/document'
import type { ProcessingPhase } from '@/types/case-file'

export interface ProcessingDocument {
  id: string
  original_filename: string
  file_extension: string
  file_size: number
  processing_status: DocumentProcessingStatus
  processing_error: string | null
  processing_error_stage: string | null
  processing_stage_updated_at: string
  uploaded_at: string
  case_file: { id: string; case_number: string; caption: string; processing_phase: ProcessingPhase } | null
}

interface ProcessingRowProps {
  doc: ProcessingDocument
  onCancel?: (id: string) => void
}

function fileIcon(ext: string) {
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return FileImage
  if (['pdf'].includes(ext)) return FileText
  if (['xml', 'docx', 'doc', 'txt'].includes(ext)) return FileCode2
  return File
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const STATUS_BADGE: Record<
  DocumentProcessingStatus,
  { label: string; icon: typeof Loader2; className: string }
> = {
  UPLOADED:             { label: 'Queued',      icon: Clock,         className: 'bg-muted text-muted-foreground' },
  OCR_IN_PROGRESS:      { label: 'Processing',  icon: Loader2,       className: 'bg-blue-500/15 text-blue-700' },
  METADATA_EXTRACTION:  { label: 'Processing',  icon: Loader2,       className: 'bg-blue-500/15 text-blue-700' },
  CASE_GENERATION:      { label: 'Generating',  icon: Loader2,       className: 'bg-amber-500/15 text-amber-700' },
  COMPLETED:            { label: 'Completed',   icon: CheckCircle2,  className: 'bg-green-500/15 text-green-700' },
  ERROR:                { label: 'Error',       icon: XCircle,       className: 'bg-destructive/15 text-destructive' },
}

const ACTIVE_STATUSES = new Set<DocumentProcessingStatus>(['OCR_IN_PROGRESS', 'METADATA_EXTRACTION', 'CASE_GENERATION'])

export function ProcessingRow({ doc, onCancel }: ProcessingRowProps) {
  const [cancelling, setCancelling] = useState(false)
  const Icon = fileIcon(doc.file_extension)
  const isAnalyzing = doc.processing_status === 'COMPLETED' && doc.case_file?.processing_phase === 'analyzing'
  const isActive   = ACTIVE_STATUSES.has(doc.processing_status) || isAnalyzing
  const isQueued   = doc.processing_status === 'UPLOADED'
  const isError    = doc.processing_status === 'ERROR'
  const isDone     = doc.processing_status === 'COMPLETED' && !isAnalyzing
  const canCancel  = (ACTIVE_STATUSES.has(doc.processing_status) || isQueued) && !cancelling

  const badge = isAnalyzing
    ? { label: 'Analyzing', icon: Loader2, className: 'bg-blue-500/15 text-blue-700' }
    : STATUS_BADGE[doc.processing_status]
  const BadgeIcon = badge.icon

  async function handleCancel() {
    if (!canCancel) return
    setCancelling(true)
    try {
      await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      onCancel?.(doc.id)
    } catch {
      setCancelling(false)
    }
  }

  return (
    <tr
      className={cn(
        'border-b last:border-0 transition-colors',
        isError && 'bg-destructive/5 hover:bg-destructive/8',
        isDone  && 'hover:bg-muted/30',
        !isError && !isDone && 'hover:bg-muted/20',
      )}
    >
      {/* Name */}
      <td className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            isError ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted',
          )}>
            <Icon className={cn('h-4 w-4', isError ? 'text-destructive' : 'text-muted-foreground')} aria-hidden="true" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <p className="truncate text-sm font-medium text-foreground" title={doc.original_filename}>
              {doc.original_filename}
            </p>
            {isError && doc.processing_error && (
              <p className="truncate text-xs text-destructive/80 mt-0.5" title={doc.processing_error}>
                {doc.processing_error}
              </p>
            )}
            {isDone && doc.case_file && (
              <Link
                href={`/cases/${doc.case_file.id}`}
                className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline mt-0.5"
              >
                {doc.case_file.case_number}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </td>

      {/* Size */}
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatBytes(doc.file_size)}
      </td>

      {/* Date uploaded */}
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(doc.uploaded_at)}
      </td>

      {/* Pipeline track */}
      <td className="px-4 py-3">
        <ProcessingPipelineTrack
          status={doc.processing_status}
          errorStage={doc.processing_error_stage}
          processingPhase={doc.case_file?.processing_phase ?? null}
          className="w-64"
        />
      </td>

      {/* Status badge + cancel */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Badge
            variant="outline"
            className={cn('inline-flex items-center gap-1 border-0 px-2 py-0.5 text-[11px] font-medium', badge.className)}
          >
            <BadgeIcon className={cn('h-3 w-3', isActive && 'animate-spin')} aria-hidden="true" />
            {badge.label}
          </Badge>
          {canCancel && (
            <button
              onClick={handleCancel}
              title="Cancel processing"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {cancelling && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </td>
    </tr>
  )
}

// Keep old name exported for any legacy import
export { ProcessingRow as ProcessingCard }
