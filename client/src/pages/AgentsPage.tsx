import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getApiBase } from '../lib/api'
import { ProfilesTab } from '../components/agents/ProfilesTab'
import { AgentsCatalogTab } from '../components/agents/AgentsCatalogTab'

type Tab = 'profiles' | 'catalog'

interface CoreVersionStatus {
  version: string | null
  required: string
  profileAware: boolean
}

const TAB_MEMORY_KEY = 'specrails-hub:agents-tab'

function readTabMemory(): Tab {
  try {
    const v = localStorage.getItem(TAB_MEMORY_KEY)
    if (v === 'profiles' || v === 'catalog') return v
  } catch {
    // localStorage unavailable
  }
  return 'profiles'
}

export default function AgentsPage() {
  const [tab, setTabState] = useState<Tab>(() => readTabMemory())
  const setTab = (next: Tab) => {
    setTabState(next)
    try { localStorage.setItem(TAB_MEMORY_KEY, next) } catch { /* ignore */ }
  }
  const [coreStatus, setCoreStatus] = useState<CoreVersionStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${getApiBase()}/profiles/core-version`)
      .then((r) => (r.ok ? (r.json() as Promise<CoreVersionStatus>) : null))
      .then((data) => {
        if (!cancelled && data) setCoreStatus(data)
      })
      .catch(() => {
        // ignore — banner simply won't show
      })
    return () => {
      cancelled = true
    }
  }, [])

  const showUpgradeBanner = coreStatus !== null && !coreStatus.profileAware

  return (
    <div className="flex flex-col h-full bg-background">
      {showUpgradeBanner && (
        <div className="flex-shrink-0 flex items-start gap-3 px-6 py-3 border-b border-yellow-500/30 bg-yellow-500/10">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <div className="font-medium text-yellow-500">
              Profile-aware pipeline requires specrails-core {coreStatus!.required}+
            </div>
            <div className="text-yellow-500/80 mt-0.5">
              This project has{' '}
              <code className="px-1 rounded bg-yellow-500/20">
                {coreStatus!.version ?? 'unknown'}
              </code>
              . Run{' '}
              <code className="px-1 rounded bg-yellow-500/20">
                npx specrails-core@latest update
              </code>{' '}
              inside the project to unlock profile mode. Profiles you create here will still save;
              they just won't affect the pipeline until core is updated.
            </div>
          </div>
        </div>
      )}

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
      <div className="flex-1 min-w-0 overflow-auto">
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

