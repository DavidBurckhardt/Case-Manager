/**
 * Resets any case stuck in 'analyzing' back to 'preview' on first call.
 * Runs once per process — safe to call from any API route on startup.
 * Handles the case where a container restart killed a running Phase 2.
 */
let ran = false

export async function recoverOrphanedCases(): Promise<void> {
  if (ran) return
  ran = true

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any

    const { data, error } = await db
      .from('case_files')
      .update({ processing_phase: 'preview' })
      .eq('processing_phase', 'analyzing')
      .select('id, case_number')

    if (error) {
      console.error('[startup] Failed to reset orphaned analyzing cases:', error)
    } else if (data?.length) {
      console.log(`[startup] Reset ${data.length} orphaned case(s) analyzing → preview:`, data.map((c: { case_number: string }) => c.case_number).join(', '))
    }
  } catch (err) {
    console.error('[startup] Recovery failed:', err)
  }
}
