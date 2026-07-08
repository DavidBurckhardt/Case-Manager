import { EmptyState } from '@/components/shared/empty-state'
import { FolderOpen } from 'lucide-react'

export default function Page() {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Coming soon"
      description="This section is under construction."
    />
  )
}
