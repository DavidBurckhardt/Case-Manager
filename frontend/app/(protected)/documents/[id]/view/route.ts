import { NextResponse } from 'next/server'
import { getCaseFileDocument } from '@/services/document.service'
import { ApiError } from '@/services/case-file.service'

/**
 * Read-only document viewer: validates the session, mints a short-lived
 * signed URL for the storage object, and redirects the browser to it.
 * PDFs and images render natively in the new tab.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const doc = await getCaseFileDocument(id, true)
    if (!doc.download_url) {
      return NextResponse.json({ error: 'No se pudo generar el enlace de lectura.' }, { status: 500 })
    }
    return NextResponse.redirect(doc.download_url)
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    // Surface the real cause: this catch-all previously hid the underlying
    // error (signed-URL / service-role failures), making prod debugging blind.
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[documents/${id}/view] failed:`, err)
    return NextResponse.json(
      { error: 'Error al abrir el documento.', detail },
      { status: 500 },
    )
  }
}
