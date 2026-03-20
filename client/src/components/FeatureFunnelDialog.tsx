import { useState, useEffect } from 'react'
import { GitBranch, Lightbulb, PenLine, ListChecks, Hammer, CheckCircle2, Inbox } from 'lucide-react'
import { cn } from '../lib/utils'
import { Dialog, DialogContent } from './ui/dialog'
import { getApiBase } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type FunnelPhase = 'exploring' | 'designing' | 'ready' | 'building' | 'shipped'

interface ChangeArtifacts {
  proposal: boolean
  design: boolean
  tasks: boolean
}

interface ChangeInfo {
  id: string
  name: string
  phase: FunnelPhase
  artifacts: ChangeArtifacts
  createdAt: string | null
  isArchived: boolean
  archivedAt: string | null
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: {
  phase: FunnelPhase
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  badgeClass: string
}[] = [
  { phase: 'exploring', label: 'Exploring', icon: Lightbulb, colorClass: 'border-yellow-500/30', badgeClass: 'bg-yellow-500/10 text-yellow-400' },
  { phase: 'designing', label: 'Designing', icon: PenLine, colorClass: 'border-blue-500/30', badgeClass: 'bg-blue-500/10 text-blue-400' },
  { phase: 'ready', label: 'Ready to Build', icon: ListChecks, colorClass: 'border-purple-500/30', badgeClass: 'bg-purple-500/10 text-purple-400' },
  { phase: 'building', label: 'Building', icon: Hammer, colorClass: 'border-orange-500/30', badgeClass: 'bg-orange-500/10 text-orange-400' },
  { phase: 'shipped', label: 'Shipped', icon: CheckCircle2, colorClass: 'border-green-500/30', badgeClass: 'bg-green-500/10 text-green-400' },
]

// ─── ChangeCard ───────────────────────────────────────────────────────────────

function ArtifactDot({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        'inline-block w-2 h-2 rounded-full',
        present ? 'bg-foreground/60' : 'bg-foreground/10'
      )}
    />
  )
}

function ChangeCard({ change }: { change: ChangeInfo }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5 flex flex-col gap-1.5 hover:border-border/80 cursor-default select-none">
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-medium leading-snug line-clamp-2">{change.name}</span>
      </div>

      {/* Artifact dots */}
      <div className="flex items-center gap-1">
        <ArtifactDot present={change.artifacts.proposal} label="proposal.md" />
        <ArtifactDot present={change.artifacts.design} label="design.md" />
        <ArtifactDot present={change.artifacts.tasks} label="tasks.md" />
        <span className="text-[10px] text-muted-foreground ml-0.5">
          {[
            change.artifacts.proposal && 'P',
            change.artifacts.design && 'D',
            change.artifacts.tasks && 'T',
          ].filter(Boolean).join('·') || '—'}
        </span>
      </div>

      {/* Date */}
      {(change.createdAt || change.archivedAt) && (
        <span className="text-[10px] text-muted-foreground">
          {change.isArchived && change.archivedAt
            ? `Shipped ${change.archivedAt.slice(0, 10)}`
            : change.createdAt
            ? `Created ${change.createdAt.slice(0, 10)}`
            : null}
        </span>
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function FunnelColumn({
  phase: _phase,
  label,
  icon: Icon,
  colorClass,
  badgeClass,
  changes,
}: (typeof COLUMNS)[0] & { changes: ChangeInfo[] }) {
  return (
    <div className={cn('flex flex-col gap-2 min-w-0', colorClass)}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {changes.length > 0 && (
          <span className={cn('ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full', badgeClass)}>
            {changes.length}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-1.5 min-h-[80px]">
        {changes.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-md border border-dashed border-border/40">
            <span className="text-[10px] text-muted-foreground/40">—</span>
          </div>
        ) : (
          changes.map((c) => <ChangeCard key={c.id} change={c} />)
        )}
      </div>
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface FeatureFunnelDialogProps {
  open: boolean
  onClose: () => void
}

export default function FeatureFunnelDialog({ open, onClose }: FeatureFunnelDialogProps) {
  const [changes, setChanges] = useState<ChangeInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`${getApiBase()}/changes`)
      .then((r) => r.json())
      .then((data) => setChanges(data.changes ?? []))
      .catch(() => setChanges([]))
      .finally(() => setLoading(false))
  }, [open])

  const byPhase = (phase: FunnelPhase) => changes.filter((c) => c.phase === phase)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Feature Funnel</span>
          <span className="text-xs text-muted-foreground ml-1">— idea → spec → code → ship</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Loading changes…
            </div>
          ) : changes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Inbox className="w-8 h-8 opacity-30" />
              <p className="text-sm">No OpenSpec changes found</p>
              <p className="text-xs opacity-60">Run <code className="font-mono">/opsx:new</code> to create your first change</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3 min-w-[700px]">
              {COLUMNS.map((col) => (
                <FunnelColumn key={col.phase} {...col} changes={byPhase(col.phase)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer stats */}
        {!loading && changes.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border">
            {COLUMNS.map((col) => {
              const count = byPhase(col.phase).length
              return count > 0 ? (
                <span key={col.phase} className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{count}</span> {col.label.toLowerCase()}
                </span>
              ) : null
            })}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {changes.length} total change{changes.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
