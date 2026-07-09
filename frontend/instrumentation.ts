/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Resets any case stuck in 'analyzing' back to 'preview' so the UI
 * shows the correct banner if Phase 2 was killed by a container restart.
 */
export async function register() {
  // Only run on the Node.js server — skip edge runtime
  if (process.env.NEXT_RUNTIME === 'edge') return

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
    console.error('[startup] Recovery hook failed:', err)
  }
}
