import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FolderOpen, Clock, FileText, Bell, Upload } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { DocumentUploader } from '@/components/documents'
import { RecentActivity } from '@/components/home/recent-activity'

export const metadata = { title: 'Home — Generador de Expedientes' }

async function getSummaryStats() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [{ count: cases }, { count: docs }] = await Promise.all([
    db.from('case_files').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    db.from('case_file_documents').select('*', { count: 'exact', head: true }).is('deleted_at', null),
  ])

  return { cases: cases ?? 0, docs: docs ?? 0 }
}

const STAT_CARDS = [
  { label: 'Active Cases',      href: '/cases',         icon: FolderOpen, key: 'cases' as const },
  { label: 'Pending Deadlines', href: '/deadlines',     icon: Clock,      key: null },
  { label: 'Documents',         href: '/documents',     icon: FileText,   key: 'docs' as const },
  { label: 'Notifications',     href: '/notifications', icon: Bell,       key: null },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const stats = await getSummaryStats()

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-16">

      {/* Greeting */}
      <div>
        <h2 className="text-xl font-semibold">Good day, {firstName}</h2>
        <p className="text-sm text-muted-foreground">
          Drag and drop documents to start processing. Cases are created automatically.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ label, href, icon: Icon, key }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="text-2xl font-bold">{key ? stats[key] : '—'}</span>
          </Link>
        ))}
      </div>

      {/* Document intake — direct drop, no case selector */}
      <section aria-labelledby="intake-heading">
        <div className="mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 id="intake-heading" className="font-semibold">Document Intake</h3>
          <span className="text-xs text-muted-foreground">
            — OCR and case generation happen automatically
          </span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <DocumentUploader uploadUrl="/api/documents/upload" />
        </div>
      </section>

      {/* Recent activity */}
      <section aria-labelledby="activity-heading">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 id="activity-heading" className="font-semibold">Recent Documents</h3>
          </div>
          <Link href="/processing" className="text-xs text-muted-foreground hover:text-primary hover:underline">
            View processing →
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          }
        >
          <RecentActivity />
        </Suspense>
      </section>

    </div>
  )
}
