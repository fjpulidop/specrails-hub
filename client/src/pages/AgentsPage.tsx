import { useState } from 'react'
import { ProfilesTab } from '../components/agents/ProfilesTab'

type Tab = 'profiles' | 'agents' | 'models'

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>('profiles')

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="px-6 pt-4">
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage agent profiles, custom agents, and model defaults for this project.
          </p>
        </div>
        <div className="flex items-center gap-1 px-4 pt-3">
          <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>
            Profiles
          </TabButton>
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>
            Agents
          </TabButton>
          <TabButton active={tab === 'models'} onClick={() => setTab('models')}>
            Models
          </TabButton>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'profiles' && <ProfilesTab />}
        {tab === 'agents' && <ComingSoon title="Agents catalog + Studio" />}
        {tab === 'models' && <ComingSoon title="Default models per role" />}
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

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">
          Coming soon. This tab ships alongside the custom agent editor and default
          model selectors in a follow-up release.
        </div>
      </div>
    </div>
  )
}
