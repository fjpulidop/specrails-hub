import { useState, useEffect, useCallback, useRef } from 'react'
import { GitBranch, Lightbulb, PenLine, ListChecks, Sparkles, Play, Archive, RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'

// ─── Types ────────────────────────────────────────────────────────────────────

type FunnelPhase = 'exploring' | 'designing' | 'ready' | 'building' | 'shipped'

interface ChangeInfo {
  id: string
  name: string
  phase: FunnelPhase
  artifacts: { proposal: boolean; design: boolean; tasks: boolean }
  createdAt: string | null
  isArchived: boolean
  archivedAt: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function phaseLabel(phase: FunnelPhase): string {
  switch (phase) {
    case 'exploring': return 'Exploring'
    case 'designing': return 'Designing'
    case 'ready': return 'Ready to Build'
    case 'building': return 'Building'
    case 'shipped': return 'Shipped'
  }
}

function PhaseIcon({ phase, className }: { phase: FunnelPhase; className?: string }) {
  switch (phase) {
    case 'exploring': return <Lightbulb className={className} />
    case 'designing': return <PenLine className={className} />
    case 'ready': return <ListChecks className={className} />
    case 'building': return <Play className={className} />
    case 'shipped': return <Archive className={className} />
  }
}

function phaseColorClass(phase: FunnelPhase): string {
  switch (phase) {
    case 'exploring': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    case 'designing': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    case 'ready': return 'text-purple-400 bg-purple-500/10 border-purple-500/30'
    case 'building': return 'text-orange-400 bg-orange-500/10 border-orange-500/30'
    case 'shipped': return 'text-green-400 bg-green-500/10 border-green-500/30'
  }
}

function ArtifactPip({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full',
        present ? 'bg-current opacity-80' : 'bg-current opacity-20'
      )}
    />
  )
}

// ─── ChangeRow ────────────────────────────────────────────────────────────────

interface ChangeRowProps {
  change: ChangeInfo
  onContinue: (id: string) => void
  onArchive: (id: string) => void
  actionPending: string | null
}

function ChangeRow({ change, onContinue, onArchive, actionPending }: ChangeRowProps) {
  const isPending = actionPending === change.id
  const colorClass = phaseColorClass(change.phase)

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 bg-card/30 hover:bg-card/60 transition-colors">
      {/* Phase badge */}
      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium min-w-[90px]', colorClass)}>
        <PhaseIcon phase={change.phase} className="w-2.5 h-2.5" />
        {phaseLabel(change.phase)}
      </span>

      {/* Change name + artifacts */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{change.name}</span>
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <ArtifactPip present={change.artifacts.proposal} label="proposal.md" />
            <ArtifactPip present={change.artifacts.design} label="design.md" />
            <ArtifactPip present={change.artifacts.tasks} label="tasks.md" />
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{change.id}</span>
      </div>

      {/* Actions */}
      {!change.isArchived && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            disabled={isPending}
            onClick={() => onContinue(change.id)}
          >
            {isPending ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Play className="w-2.5 h-2.5" />
            )}
            Continue
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
            disabled={isPending}
            onClick={() => onArchive(change.id)}
          >
            <Archive className="w-2.5 h-2.5" />
            Archive
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChangesPage() {
  const { activeProjectId } = useHub()
  const [changes, setChanges] = useState<ChangeInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)

  const prevProjectId = useRef(activeProjectId)

  const fetchChanges = useCallback(async () => {
    if (!activeProjectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/changes`)
      if (!res.ok) throw new Error(`Server error (${res.status})`)
      const data = await res.json() as { changes: ChangeInfo[] }
      setChanges(data.changes)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [activeProjectId])

  useEffect(() => {
    if (activeProjectId !== prevProjectId.current) {
      prevProjectId.current = activeProjectId
      setChanges([])
      setError(null)
    }
    fetchChanges()
  }, [activeProjectId, fetchChanges])

  async function spawnCommand(changeId: string, command: string) {
    setActionPending(changeId)
    try {
      await fetch(`${getApiBase()}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      // Refresh after a short delay to let the job appear
      setTimeout(fetchChanges, 500)
    } catch (err) {
      console.warn('[changes] spawn failed:', err)
    } finally {
      setActionPending(null)
    }
  }

  const handleContinue = (id: string) => spawnCommand(id, `/opsx:continue ${id}`)
  const handleArchive = (id: string) => spawnCommand(id, `/opsx:archive ${id}`)

  const activeChanges = changes.filter((c) => !c.isArchived)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Active Changes</h2>
          {activeChanges.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dracula-purple/20 text-dracula-purple font-medium">
              {activeChanges.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          disabled={loading}
          onClick={fetchChanges}
          title="Refresh"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading && changes.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg border border-border/40 bg-card/20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && activeChanges.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="w-10 h-10 rounded-full bg-dracula-purple/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-dracula-purple/60" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">No active changes</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click <strong>New Change</strong> in the navbar to start your first OpenSpec change.
            </p>
          </div>
        </div>
      )}

      {/* Active changes list */}
      {activeChanges.length > 0 && (
        <div className="space-y-2">
          {activeChanges.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              onContinue={handleContinue}
              onArchive={handleArchive}
              actionPending={actionPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Export badge count hook ──────────────────────────────────────────────────

/** Returns the count of active (non-archived) changes for badge display */
export async function fetchActiveChangesCount(apiBase: string): Promise<number> {
  try {
    const res = await fetch(`${apiBase}/changes`)
    if (!res.ok) return 0
    const data = await res.json() as { changes: { isArchived: boolean }[] }
    return data.changes.filter((c) => !c.isArchived).length
  } catch {
    return 0
  }
}
