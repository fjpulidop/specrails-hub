import { useState } from 'react'
import { ProfilesTab } from '../components/agents/ProfilesTab'
import { AgentsCatalogTab } from '../components/agents/AgentsCatalogTab'

type Tab = 'profiles' | 'catalog'

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>('profiles')

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="px-6 pt-4">
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage agent profiles and the catalog of agents (upstream + custom) for this project.
          </p>
        </div>
        <div className="flex items-center gap-1 px-4 pt-3">
          <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>
            Profiles
          </TabButton>
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            Agents Catalog
          </TabButton>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'profiles' && <ProfilesTab />}
        {tab === 'catalog' && <AgentsCatalogTab />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-8 px-3 text-xs font-medium rounded-t-md border-b-2 transition-colors ' +
        (active
          ? 'text-foreground border-foreground'
          : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border')
      }
    >
      {children}
    </button>
  )
}

