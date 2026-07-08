'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { usePageTitle } from './page-title'

interface AppShellProps {
  children: React.ReactNode
  userEmail?: string
  userRole?: string
}

export function AppShell({ children, userEmail, userRole }: AppShellProps) {
  const title = usePageTitle()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — fixed width, full height */}
      <Sidebar userRole={userRole} />

      {/* Right column: header + scrollable content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} userEmail={userEmail} />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto"
          aria-label="Main content"
        >
          <div className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
