'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Plus, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentUploader } from '@/components/documents'
import { cn } from '@/lib/utils'
import type { CaseFileDocument } from '@/types/document'

interface CaseOption {
  id: string
  case_number: string
  caption: string
}

interface UploadSectionProps {
  onUploadComplete?: (docs: CaseFileDocument[]) => void
}

export function UploadSection({ onUploadComplete }: UploadSectionProps) {
  const [selectedCase, setSelectedCase] = useState<CaseOption | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CaseOption[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const comboboxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch(`/api/case-files/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json())
    } finally {
      setSearching(false)
    }
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  function selectCase(c: CaseOption) {
    setSelectedCase(c)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function clearCase() {
    setSelectedCase(null)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const uploadUrl = selectedCase
    ? `/api/case-files/${selectedCase.id}/documents`
    : null

  return (
    <div className="space-y-5">
      {/* Case selector */}
      <div className="space-y-1.5">
        <label htmlFor="case-search" className="text-sm font-medium">Asociar con un expediente</label>

        {selectedCase ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{selectedCase.case_number}</span>
              <span className="ml-2 truncate text-xs text-muted-foreground">{selectedCase.caption}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={clearCase} aria-label="Quitar selección de expediente">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div ref={comboboxRef} className="relative">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                id="case-search"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls="case-listbox"
                placeholder="Buscar por número o carátula…"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-9 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleQueryChange(e.target.value)}
                onFocus={() => { if (results.length) setOpen(true) }}
              />
              {(query || searching) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {searching
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
                    : (
                      <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} aria-label="Limpiar búsqueda">
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )
                  }
                </div>
              )}
            </div>

            {open && (results.length > 0) && (
              <ul
                id="case-listbox"
                role="listbox"
                aria-label="Resultados de expediente"
                className="absolute z-50 mt-1 w-full rounded-lg border bg-popover py-1 shadow-md"
              >
                {results.map((c) => (
                  <li key={c.id} role="none">
                    <button
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                      onClick={() => selectCase(c)}
                    >
                      <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-[-90deg] text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <span className="font-medium">{c.case_number}</span>
                        <p className="truncate text-xs text-muted-foreground">{c.caption}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {open && query.length > 0 && !searching && results.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover p-3 shadow-md">
                <p className="text-sm text-muted-foreground">No se encontraron expedientes para &ldquo;{query}&rdquo;</p>
                <a href="/cases/new" className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                  <Plus className="h-3.5 w-3.5" /> Crear nuevo expediente
                </a>
              </div>
            )}
          </div>
        )}

        {!selectedCase && (
          <p className="text-xs text-muted-foreground">
            Seleccioná un expediente primero, o{' '}
            <a href="/cases/new" className="underline hover:text-primary">creá uno nuevo</a>
            .
          </p>
        )}
      </div>

      {/* Upload zone — locked until case selected */}
      <div className={cn(!selectedCase && 'pointer-events-none opacity-50')}>
        {uploadUrl ? (
          <DocumentUploader
            uploadUrl={uploadUrl}
            onUploadComplete={(docs) => {
              onUploadComplete?.(docs)
            }}
          />
        ) : (
          <DocumentUploader
            uploadUrl=""
            onUploadComplete={onUploadComplete}
            compact={false}
          />
        )}
      </div>
    </div>
  )
}
