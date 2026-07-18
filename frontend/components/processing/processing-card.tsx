'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText, FileImage, FileCode2, File,
  CheckCircle2, XCircle, Loader2, ExternalLink, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
  case_file: {
    id: string
    case_number: string
    caption: string
    processing_phase: ProcessingPhase
    phase2_docs_total: number
    phase2_docs_completed: number
  } | null
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

type BadgeConfig = { label: string; icon: typeof Loader2; spin: boolean; className: string }

function resolveBadge(doc: ProcessingDocument): BadgeConfig {
  if (doc.processing_status === 'ERROR') {
    return { label: 'Error', icon: XCircle, spin: false, className: 'bg-red-500/15 text-red-600' }
  }

  // COMPLETED but case not yet attached = still processing on the backend
  const effectivePhase = doc.case_file?.processing_phase ?? (doc.processing_status === 'COMPLETED' ? 'analyzing' : null)
  const isFullyDone = doc.processing_status === 'COMPLETED' && effectivePhase !== 'analyzing'

  if (isFullyDone) {
    return { label: 'Completado', icon: CheckCircle2, spin: false, className: 'bg-green-500/15 text-green-700' }
  }

  return { label: 'Procesando', icon: Loader2, spin: true, className: 'bg-amber-500/15 text-amber-600' }
}

export function ProcessingRow({ doc, onCancel }: ProcessingRowProps) {
  const [cancelling, setCancelling] = useState(false)
  const Icon = fileIcon(doc.file_extension)
  const badge = resolveBadge(doc)
  const BadgeIcon = badge.icon

  const isProcessing = badge.label === 'Procesando'
  const isError      = badge.label === 'Error'
  const isDone       = badge.label === 'Completado'
  const canCancel    = isError && !cancelling

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
        isError      && 'bg-destructive/5 hover:bg-destructive/8',
        isDone       && 'hover:bg-muted/30',
        isProcessing && 'hover:bg-muted/20',
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

      {/* Status badge + cancel */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <Badge
            variant="outline"
            className={cn('inline-flex items-center gap-1.5 border-0 px-2.5 py-1 text-xs font-medium', badge.className)}
          >
            <BadgeIcon className={cn('h-3.5 w-3.5', badge.spin && 'animate-spin')} aria-hidden="true" />
            {badge.label}
          </Badge>
          {canCancel && (
            <button
              onClick={handleCancel}
              title="Cancelar procesamiento"
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

export { ProcessingRow as ProcessingCard }
