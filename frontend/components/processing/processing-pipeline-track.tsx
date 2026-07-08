'use client'

import { CheckCircle2, Loader2, XCircle, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGES, stageIndex } from './pipeline-stages'
import type { DocumentProcessingStatus } from '@/types/document'

interface ProcessingPipelineTrackProps {
  status: DocumentProcessingStatus
  errorStage?: string | null
  className?: string
}

export function ProcessingPipelineTrack({ status, errorStage, className }: ProcessingPipelineTrackProps) {
  const currentIdx = stageIndex(status, errorStage)
  const isFailed = status === 'ERROR'

  return (
    <ol aria-label="Processing pipeline" className={cn('flex items-start gap-0', className)}>
      {PIPELINE_STAGES.map((stage, i) => {
        const isDone    = isFailed ? i < currentIdx : (status === 'COMPLETED' ? true : i < currentIdx)
        const isActive  = !isFailed && i === currentIdx && status !== 'COMPLETED'
        const isFailing = isFailed && i === currentIdx
        const isPending = !isDone && !isActive && !isFailing

        return (
          <li key={stage.key} className="flex flex-1 flex-col items-center gap-0">
            <div className="flex w-full items-center">
              <div
                aria-hidden="true"
                className={cn(
                  'h-0.5 flex-1 transition-colors duration-500',
                  i === 0 ? 'invisible' : isDone ? 'bg-primary' : 'bg-border'
                )}
              />
              <div
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                  isDone    && 'border-primary bg-primary',
                  isActive  && 'border-primary bg-background ring-2 ring-primary/25',
                  isFailing && 'border-destructive bg-destructive',
                  isPending && 'border-border bg-background'
                )}
              >
                {isDone    && <CheckCircle2 className="h-3 w-3 text-primary-foreground"        aria-hidden="true" />}
                {isActive  && <Loader2     className="h-2.5 w-2.5 animate-spin text-primary"   aria-hidden="true" />}
                {isFailing && <XCircle     className="h-3 w-3 text-destructive-foreground"     aria-hidden="true" />}
                {isPending && <Circle      className="h-2 w-2 text-muted-foreground/30"        aria-hidden="true" />}
              </div>
              <div
                aria-hidden="true"
                className={cn(
                  'h-0.5 flex-1 transition-colors duration-500',
                  i === PIPELINE_STAGES.length - 1 ? 'invisible' : isDone ? 'bg-primary' : 'bg-border'
                )}
              />
            </div>
            <span
              className={cn(
                'mt-1 text-center text-[9px] font-medium leading-tight whitespace-nowrap',
                isDone    && 'text-primary',
                isActive  && 'text-primary',
                isFailing && 'text-destructive',
                isPending && 'text-muted-foreground/40'
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
