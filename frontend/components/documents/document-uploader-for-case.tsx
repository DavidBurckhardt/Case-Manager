'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { DocumentUploader } from './document-uploader'
import { apiUrl } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { CaseFileDocument } from '@/types/document'

interface Props {
  caseId: string
  className?: string
}

/**
 * Adjunta documentos a un expediente que ya existe.
 *
 * A diferencia de DocumentUploaderWithRedirect no navega a ningún lado: el
 * usuario ya está mirando la ficha. Al terminar, router.refresh() vuelve a
 * pedir el Server Component de la página, así la lista de documentos y el
 * cartel de "análisis en curso" se actualizan sin recargar el navegador ni
 * perder el scroll o la pestaña activa.
 */
export function DocumentUploaderForCase({ caseId, className }: Props) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()
  const [attached, setAttached] = useState(0)

  function handleUploadComplete(docs: CaseFileDocument[]) {
    setAttached(docs.length)
    startTransition(() => router.refresh())
  }

  return (
    <div className={cn('space-y-3', className)}>
      <DocumentUploader
        uploadUrl={apiUrl(`/cases/${caseId}/documents`)}
        onUploadComplete={handleUploadComplete}
        compact
      />

      {attached > 0 && (
        <div
          className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
          role="status"
          aria-live="polite"
        >
          {isRefreshing
            ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          }
          <p>
            {attached} documento{attached !== 1 ? 's' : ''} adjuntado{attached !== 1 ? 's' : ''}.
            {' '}El expediente se está re-analizando con los documentos nuevos — los datos
            extraídos pueden tardar unos minutos en actualizarse.
          </p>
        </div>
      )}
    </div>
  )
}
