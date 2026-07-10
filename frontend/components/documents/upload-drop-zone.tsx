'use client'

import {
  useRef,
  useState,
  useCallback,
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { Upload, FolderOpen } from 'lucide-react'
import { ALLOWED_EXTENSIONS } from '@/constants/storage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UploadDropZoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
  compact?: boolean
}

export function UploadDropZone({ onFiles, disabled = false, compact = false }: UploadDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Counter tracks nested dragenter/dragleave events inside the zone
  const dragCounter = useRef(0)

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleFiles = useCallback(
    (rawFiles: FileList | null) => {
      if (!rawFiles?.length) return
      onFiles(Array.from(rawFiles))
    },
    [onFiles]
  )

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      dragCounter.current += 1
      if (dragCounter.current === 1) setIsDragging(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (disabled) return
      handleFiles(e.dataTransfer.files)
    },
    [disabled, handleFiles]
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
      e.target.value = ''
    },
    [handleFiles]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPicker()
      }
    },
    [openPicker]
  )

  const accept = ALLOWED_EXTENSIONS.join(',')
  const maxMb = process.env.NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB ?? '25'

  return (
    <div
      ref={zoneRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Área de carga de documentos. Presioná Intro o Espacio para abrir el selector de archivos, o arrastrá y soltá archivos aquí."
      aria-disabled={disabled}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={openPicker}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed text-center outline-none transition-all duration-150',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        compact ? 'px-4 py-8' : 'px-8 py-14',
        isDragging
          ? 'border-primary bg-primary/8 scale-[1.01]'
          : [
              'border-muted-foreground/25',
              !disabled && 'hover:border-primary/50 hover:bg-muted/20 cursor-pointer',
            ],
        disabled && 'cursor-not-allowed opacity-50 pointer-events-none'
      )}
    >
      {/* Animated upload icon */}
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-150',
          isDragging
            ? 'border-primary bg-primary/10 scale-110'
            : 'border-muted bg-muted/50 group-hover:border-primary/40 group-hover:bg-primary/5'
        )}
      >
        <Upload
          className={cn(
            'h-6 w-6 transition-colors',
            isDragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'
          )}
          aria-hidden="true"
        />
      </div>

      {isDragging ? (
        <div className="space-y-1">
          <p className="text-base font-semibold text-primary">Soltá los archivos aquí</p>
          <p className="text-sm text-primary/70">Soltá para iniciar la carga</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>
            Arrastrá y soltá archivos aquí
          </p>
          <p className="text-sm text-muted-foreground">
            o{' '}
            <span className="font-medium text-primary underline-offset-2 group-hover:underline">
              explorá archivos
            </span>
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground/70">
              {ALLOWED_EXTENSIONS.join(' · ')} &nbsp;·&nbsp; Máximo {maxMb} MB por archivo
            </p>
          )}
        </div>
      )}

      {!compact && !isDragging && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Seleccionar archivos
        </Button>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  )
}
