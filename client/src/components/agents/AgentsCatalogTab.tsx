import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Copy } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import { Button } from '../ui/button'
import { AgentStudio } from './AgentStudio'

interface CatalogAgent {
  id: string
  kind: 'upstream' | 'custom'
  description?: string
  model?: string
}

type StudioMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; agentId: string }
  | { kind: 'duplicate'; from: string; initialBody: string }

export function AgentsCatalogTab() {
  const [agents, setAgents] = useState<CatalogAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studio, setStudio] = useState<StudioMode>({ kind: 'closed' })

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${getApiBase()}/profiles/catalog`)
      .then((r) => {
        if (!r.ok) throw new Error(`Catalog load failed: ${r.status}`)
        return r.json() as Promise<{ agents: CatalogAgent[] }>
      })
      .then((data) => {
        if (cancelled) return
        setAgents(data.agents)
        if (data.agents.length > 0 && !selectedId) setSelectedId(data.agents[0].id)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    const cleanup = refresh()
    return cleanup
  }, [refresh])

  const loadBody = useCallback((id: string) => {
    let cancelled = false
    setBodyLoading(true)
    setBody(null)
    fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Agent body load failed: ${r.status}`)
        return r.json() as Promise<{ id: string; body: string }>
      })
      .then((data) => {
        if (!cancelled) setBody(data.body)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const cleanup = loadBody(selectedId)
    return cleanup
  }, [selectedId, loadBody])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      </div>
    )
  }

  // Studio view (create / edit / duplicate)
  if (studio.kind !== 'closed') {
    return (
      <AgentStudio
        agentId={studio.kind === 'edit' ? studio.agentId : undefined}
        initialBody={studio.kind === 'duplicate' ? studio.initialBody : undefined}
        onClose={() => setStudio({ kind: 'closed' })}
        onSaved={(id) => {
          setSelectedId(id)
          setStudio({ kind: 'closed' })
          refresh()
        }}
      />
    )
  }

  const duplicate = async (fromId: string) => {
    try {
      const res = await fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(fromId)}`)
      if (!res.ok) throw new Error(`Load failed: ${res.status}`)
      const data = (await res.json()) as { body: string }
      setStudio({ kind: 'duplicate', from: fromId, initialBody: data.body })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <div className="text-sm font-medium text-foreground">No agents installed</div>
          <div className="text-xs text-muted-foreground mt-1 mb-4">
            Run <code className="text-foreground">npx specrails-core@latest update</code> in this
            project to install the upstream agents, or create a custom agent now.
          </div>
          <Button size="sm" onClick={() => setStudio({ kind: 'create' })}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New custom agent
          </Button>
        </div>
      </div>
    )
  }

  const upstream = agents.filter((a) => a.kind === 'upstream')
  const custom = agents.filter((a) => a.kind === 'custom')
  const selected = agents.find((a) => a.id === selectedId)

  return (
    <div className="flex h-full">
      {/* Left: list grouped by kind */}
      <aside className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="px-2 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Catalog</span>
          <Button size="sm" variant="ghost" onClick={() => setStudio({ kind: 'create' })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <Section
            title={`Upstream (${upstream.length})`}
            description="Shipped by specrails-core; read-only."
          >
            {upstream.map((a) => (
              <CatalogRow
                key={a.id}
                agent={a}
                selected={a.id === selectedId}
                onSelect={() => setSelectedId(a.id)}
              />
            ))}
          </Section>
          <Section
            title={`Custom (${custom.length})`}
            description="Your project's custom-*.md files. Studio editor coming soon."
          >
            {custom.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-2 py-2 italic">
                No custom agents yet.
              </div>
            ) : (
              custom.map((a) => (
                <CatalogRow
                  key={a.id}
                  agent={a}
                  selected={a.id === selectedId}
                  onSelect={() => setSelectedId(a.id)}
                />
              ))
            )}
          </Section>
        </div>
      </aside>

      {/* Right: selected body */}
      <main className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 px-3 py-2 text-xs rounded border border-red-500/30 bg-red-500/10 text-red-400">
            {error}
          </div>
        )}
        {selected && (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-mono font-semibold">{selected.id}</h2>
                  <KindBadge kind={selected.kind} />
                  {selected.model && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      default model: {selected.model}
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => void duplicate(selected.id)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate
                </Button>
                {selected.kind === 'custom' && (
                  <Button size="sm" onClick={() => setStudio({ kind: 'edit', agentId: selected.id })}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 mt-4">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                <span className="text-[11px] font-mono text-muted-foreground">
                  .claude/agents/{selected.id}.md
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {selected.kind === 'upstream' ? 'read-only' : 'read-only (Studio coming soon)'}
                </span>
              </div>
              <pre className="p-4 text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
                {bodyLoading ? 'Loading…' : body ?? ''}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <div className="px-2 pb-1">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </div>
        {description && (
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</div>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function CatalogRow({
  agent,
  selected,
  onSelect,
}: {
  agent: CatalogAgent
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left rounded transition-colors ' +
        (selected
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')
      }
    >
      <span className="text-sm font-mono truncate">{agent.id}</span>
      <KindBadge kind={agent.kind} />
    </button>
  )
}

function KindBadge({ kind }: { kind: 'upstream' | 'custom' }) {
  return (
    <span
      className={
        'text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ' +
        (kind === 'custom'
          ? 'bg-purple-500/15 text-purple-400'
          : 'bg-muted text-muted-foreground')
      }
    >
      {kind}
    </span>
  )
}
