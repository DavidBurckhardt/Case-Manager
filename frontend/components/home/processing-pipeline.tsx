'use client'

import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentProcessingStatus } from '@/types/document'

export interface PipelineStage {
  key: DocumentProcessingStatus
  label: string
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'UPLOADED',            label: 'Uploaded' },
  { key: 'OCR_IN_PROGRESS',     label: 'OCR' },
  { key: 'METADATA_EXTRACTION', label: 'Metadata' },
  { key: 'CASE_GENERATION',     label: 'Case' },
  { key: 'COMPLETED',           label: 'Completed' },
]

function getStageIndex(status: DocumentProcessingStatus): number {
  if (status === 'ERROR') return -1
  return PIPELINE_STAGES.findIndex((s) => s.key === status)
}

interface ProcessingPipelineProps {
  status: DocumentProcessingStatus
  className?: string
}

export function ProcessingPipeline({ status, className }: ProcessingPipelineProps) {
  const failed = status === 'ERROR'
  const currentIndex = getStageIndex(status)

  return (
    <ol
      aria-label="Processing stages"
      className={cn('flex items-start gap-0', className)}
    >
      {PIPELINE_STAGES.map((stage, i) => {
        const isDone = i < currentIndex
        const isActive = i === currentIndex
        const isFailed = isActive && failed
        const isPending = i > currentIndex

        return (
          <li key={stage.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* Connector before */}
              <div
                className={cn(
                  'h-0.5 flex-1',
                  i === 0 ? 'invisible' : isDone ? 'bg-primary' : 'bg-muted'
                )}
                aria-hidden="true"
              />

              {/* Node */}
              <div
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  isDone && 'border-primary bg-primary',
                  isActive && !isFailed && 'border-primary bg-background',
                  isFailed && 'border-destructive bg-destructive',
                  isPending && 'border-muted bg-background'
                )}
              >
                {isDone && (
                  <CheckCircle2 className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
                )}
                {isActive && !isFailed && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                )}
                {isFailed && (
                  <span className="text-[10px] font-bold text-destructive-foreground" aria-hidden="true">!</span>
                )}
                {isPending && (
                  <Circle className="h-3 w-3 text-muted-foreground/40" aria-hidden="true" />
                )}
              </div>

              {/* Connector after */}
              <div
                className={cn(
                  'h-0.5 flex-1',
                  i === PIPELINE_STAGES.length - 1 ? 'invisible' : isDone ? 'bg-primary' : 'bg-muted'
                )}
                aria-hidden="true"
              />
            </div>

            {/* Label */}
            <span
              className={cn(
                'mt-1.5 text-center text-[10px] leading-tight',
                isDone && 'text-primary font-medium',
                isActive && !isFailed && 'text-primary font-semibold',
                isFailed && 'text-destructive font-medium',
                isPending && 'text-muted-foreground'
              )}
            >
              {stage.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
