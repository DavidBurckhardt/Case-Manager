'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  FileText, FileImage, FileCode2, File,
  ArrowRight, RefreshCw, Inbox,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { DocumentProcessingStatus } from '@/types/document'

interface RecentDoc {
  id: string
  original_filename: string
  file_extension: string
  file_size: number
  processing_status: DocumentProcessingStatus
  uploaded_at: string
  case_file: { id: string; case_number: string; caption: string } | null
}

const POLL_INTERVAL_MS = 8_000

function getMimeIcon(ext: string) {
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return FileImage
  if (['pdf'].includes(ext)) return FileText
  if (['xml', 'docx', 'doc'].includes(ext)) return FileCode2
  return File
}

const STATUS_CONFIG: Record<
  DocumentProcessingStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  UPLOADED:            { label: 'En cola',    variant: 'secondary' },
  METADATA_EXTRACTION: { label: 'Extrayendo', variant: 'default' },
  CASE_GENERATION:     { label: 'Generando',  variant: 'default' },
  COMPLETED:           { label: 'Completado', variant: 'default' },
  ERROR:               { label: 'Error',      variant: 'destructive' },
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora mismo'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return new Date(dateStr).toLocaleDateString()
}

interface RecentActivityProps {
  initialDocs?: RecentDoc[]
}

export function RecentActivity({ initialDocs = [] }: RecentActivityProps) {
  const [docs, setDocs] = useState<RecentDoc[]>(initialDocs)
  const [loading, setLoading] = useState(initialDocs.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/documents/recent?limit=10')
      if (res.ok) setDocs(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchDocs(initialDocs.length > 0)
    timerRef.current = setInterval(() => fetchDocs(true), POLL_INTERVAL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchDocs, initialDocs.length])

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando actividad reciente">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!docs.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 py-10 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Sin documentos aún. Subí tu primer archivo desde arriba.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Mostrando {docs.length} documento{docs.length !== 1 ? 's' : ''} reciente{docs.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => fetchDocs()}
          disabled={refreshing}
          aria-label="Actualizar actividad"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </Button>
      </div>

      <ul className="space-y-2" aria-label="Actividad reciente de documentos">
        {docs.map((doc) => {
          const Icon = getMimeIcon(doc.file_extension)
          const status = STATUS_CONFIG[doc.processing_status]

          return (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              {/* Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.original_filename}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelative(doc.uploaded_at)}</span>
                  {doc.case_file && (
                    <>
                      <span aria-hidden="true">·</span>
                      <Link
                        href={`/cases/${doc.case_file.id}`}
                        className="truncate max-w-[180px] hover:text-primary hover:underline"
                        title={doc.case_file.caption}
                      >
                        {doc.case_file.case_number}
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <Badge
                variant={status.variant}
                className={cn(
                  'shrink-0 text-[10px]',
                  doc.processing_status === 'COMPLETED' && 'bg-green-500/15 text-green-700 hover:bg-green-500/20'
                )}
              >
                {status.label}
              </Badge>

              {/* Navigate to case */}
              {doc.case_file && (
                <Link
                  href={`/cases/${doc.case_file.id}`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
                  aria-label={`Abrir expediente ${doc.case_file.case_number}`}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
