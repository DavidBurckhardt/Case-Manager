'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DeadlinesTab } from '@/components/deadlines/deadlines-tab'
import { LifecycleTab } from '@/components/cases/lifecycle-tab'

interface CaseTabsProps {
  caseId: string
  expedienteContent: React.ReactNode
  currentStatus: { code: string; label: string }
  canTransition: boolean
}

const TABS = [
  { id: 'expediente', label: 'Expediente' },
  { id: 'plazos',     label: 'Plazos' },
  { id: 'historial',  label: 'Historial' },
] as const

type TabId = (typeof TABS)[number]['id']

export function CaseTabs({ caseId, expedienteContent, currentStatus, canTransition }: CaseTabsProps) {
  const [active, setActive] = useState<TabId>('expediente')

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              active === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === 'expediente' && expedienteContent}
      {active === 'plazos'     && <DeadlinesTab caseId={caseId} />}
      {active === 'historial'  && (
        <LifecycleTab caseId={caseId} currentStatus={currentStatus} canTransition={canTransition} />
      )}
    </div>
  )
}
