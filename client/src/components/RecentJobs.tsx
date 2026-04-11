import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiBase } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Trash2, ClipboardList, GitCompareArrows, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { JobComparisonModal } from './JobComparisonModal'
import type { JobSummary, JobStatus, JobPriority } from '../types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'running' | 'queued' | 'failed' | 'canceled'

const STATUS_BADGE: Record<JobStatus, { variant: BadgeVariant; label: string; tooltip: string }> = {
  running: { variant: 'running', label: 'running', tooltip: 'Job is actively executing' },
  completed: { variant: 'success', label: 'done', tooltip: 'Job completed successfully' },
  failed: { variant: 'failed', label: 'failed', tooltip: 'Job exited with a non-zero exit code' },
  canceled: { variant: 'canceled', label: 'canceled', tooltip: 'Job was manually canceled' },
  queued: { variant: 'queued', label: 'queued', tooltip: 'Job is waiting to run' },
  zombie_terminated: { variant: 'failed', label: 'zombie', tooltip: 'Job was auto-terminated after prolonged inactivity' },
  skipped: { variant: 'warning', label: 'skipped', tooltip: 'Job was skipped because a parent job in the pipeline failed' },
}

const ALL_STATUSES: JobStatus[] = ['running', 'completed', 'failed', 'canceled', 'zombie_terminated', 'queued', 'skipped']

const PRIORITY_STYLES: Record<JobPriority, { className: string; label: string }> = {
  critical: { className: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'critical' },
  high: { className: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'high' },
  normal: { className: '', label: 'normal' },
  low: { className: 'bg-gray-500/15 text-gray-400 border-gray-500/30', label: 'low' },
}

function formatCost(cost: number | null | undefined): string | null {
  if (cost == null || cost === 0) return null
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

/** Wall-clock duration from started_at / finished_at timestamps */
function formatWallDuration(startedAt: string, finishedAt: string | null | undefined): string | null {
  if (!finishedAt) return null
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return null
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  if (mins < 60) return `${mins}m ${s}s`
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return `${hrs}h ${m}m`
}

function formatTokens(n: number | null | undefined): string | null {
  if (n == null || n === 0) return null
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatRelTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

interface RecentJobsProps {
  jobs: JobSummary[]
  isLoading?: boolean
  onJobsCleared?: () => void
  onProposalClick?: (proposalId: string) => void
  onProposalDelete?: (proposalId: string) => void
}

const PAGE_SIZE = 10

export function RecentJobs({ jobs, isLoading, onJobsCleared, onProposalClick, onProposalDelete }: RecentJobsProps) {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearFrom, setClearFrom] = useState('')
  const [clearTo, setClearTo] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const [confirmDeleteProposalId, setConfirmDeleteProposalId] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [compareJobIds, setCompareJobIds] = useState<[string, string] | null>(null)

  // Reset display limit when jobs list changes (new job added, etc.)
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE)
  }, [jobs.length])

  function toggleCompareMode() {
    setCompareMode((prev) => !prev)
    setCompareSelection([])
  }

  function toggleCompareSelect(jobId: string) {
    setCompareSelection((prev) => {
      if (prev.includes(jobId)) return prev.filter((id) => id !== jobId)
      if (prev.length >= 2) return prev
      const next = [...prev, jobId]
      if (next.length === 2) setCompareJobIds(next as [string, string])
      return next
    })
  }

  const filteredJobs = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false
    if (dateFrom && j.started_at < dateFrom) return false
    if (dateTo && j.started_at > `${dateTo}T23:59:59`) return false
    return true
  })

  const clearRangeCount = jobs.filter((j) => {
    if (clearFrom && j.started_at < clearFrom) return false
    if (clearTo && j.started_at > `${clearTo}T23:59:59`) return false
    return true
  }).length

  async function handleClear(mode: 'all' | 'range') {
    setIsClearing(true)
    try {
      const body: Record<string, string> = {}
      if (mode === 'range') {
        if (clearFrom) body.from = clearFrom
        if (clearTo) body.to = clearTo
      }
      const res = await fetch(`${getApiBase()}/jobs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json() as { deleted: number }
        toast.success(`Cleared ${data.deleted} job(s)`)
        setShowClearModal(false)
        setClearFrom('')
        setClearTo('')
        onJobsCleared?.()
      } else {
        toast.error('Failed to clear jobs')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setIsClearing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 bg-muted/30 rounded-md animate-pulse" />
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 bg-card/50 p-8 text-center space-y-2">
        <ClipboardList className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">No jobs yet</p>
        <p className="text-xs text-muted-foreground/60">
          Run a command above to see your job history here
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              statusFilter === null
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            All ({jobs.length})
          </button>
          {ALL_STATUSES.map((s) => {
            const count = jobs.filter((j) => j.status === s).length
            if (count === 0) return null
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {s} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-6 rounded border border-border bg-input px-1.5 text-[10px] text-foreground"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-6 rounded border border-border bg-input px-1.5 text-[10px] text-foreground"
            title="To date"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 w-6 p-0 transition-colors ${compareMode ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={toggleCompareMode}
              >
                <GitCompareArrows className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{compareMode ? 'Exit compare mode' : 'Compare 2 jobs'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setShowClearModal(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear jobs</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Compare mode banner */}
      {compareMode && (
        <div className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            {compareSelection.length === 0 && 'Select 2 jobs to compare'}
            {compareSelection.length === 1 && 'Select 1 more job'}
            {compareSelection.length === 2 && 'Ready — click compare'}
          </span>
          {compareSelection.length === 2 && (
            <button
              type="button"
              className="text-[10px] font-medium text-foreground hover:underline"
              onClick={() => setCompareJobIds(compareSelection as [string, string])}
            >
              Compare →
            </button>
          )}
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <span className="w-14">Status</span>
        <span className="flex-1 min-w-0">Command</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="w-14 text-right">Duration</span>
          <span className="w-12 text-right">Tokens</span>
          <span className="w-12 text-right">Cost</span>
          <span className="w-20 text-right">Started</span>
        </div>
      </div>

      {/* Job rows */}
      <div className="space-y-0.5">
        {filteredJobs.slice(0, displayLimit).map((job) => {
          const statusInfo = STATUS_BADGE[job.status] ?? STATUS_BADGE.queued
          const cost = formatCost(job.total_cost_usd)
          const duration = formatWallDuration(job.started_at, job.finished_at)
          const tokens = formatTokens(((job.tokens_in ?? 0) + (job.tokens_out ?? 0)) || null)

          const isProposal = job.id.startsWith('proposal:')
          const proposalId = isProposal ? job.id.replace('proposal:', '') : null

          const isSelected = compareSelection.includes(job.id)
          const isDisabled = compareMode && !isProposal && compareSelection.length === 2 && !isSelected

          return (
            <div
              key={job.id}
              role="button"
              tabIndex={0}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group ${
                isSelected
                  ? 'bg-accent/70 ring-1 ring-border'
                  : isDisabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-accent/50'
              }`}
              onClick={() => {
                if (compareMode && !isProposal) {
                  toggleCompareSelect(job.id)
                  return
                }
                if (isProposal && proposalId) {
                  onProposalClick?.(proposalId)
                } else {
                  navigate(`/jobs/${job.id}`)
                }
              }}
            >
              {/* Status badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{statusInfo.tooltip}</TooltipContent>
              </Tooltip>

              {/* Priority badge (only for non-normal) */}
              {job.priority && job.priority !== 'normal' && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border ${PRIORITY_STYLES[job.priority].className}`}>
                  {PRIORITY_STYLES[job.priority].label}
                </span>
              )}

              {/* Command */}
              <div className="flex items-center gap-1 flex-1 min-w-0">
                {job.pipeline_id && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link2 className="w-3 h-3 text-dracula-purple/60 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Part of a pipeline
                      {job.depends_on_job_id && ' (depends on previous step)'}
                      {job.skip_reason && ` — ${job.skip_reason}`}
                    </TooltipContent>
                  </Tooltip>
                )}
                <code className="text-xs text-foreground/80 truncate">
                  {job.command}
                </code>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                <span className="w-14 text-right">{duration ?? '—'}</span>
                <span className="w-12 text-right">{tokens ? `${tokens}` : '—'}</span>
                <span className="w-12 text-right">{cost ?? '—'}</span>
                <span className="w-20 text-right">{formatRelTime(job.started_at)}</span>
                {isProposal && proposalId && (
                  <button
                    type="button"
                    className="w-4 h-4 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteProposalId(proposalId) }}
                    title="Delete proposal"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {filteredJobs.length > displayLimit && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded hover:bg-accent/50"
          >
            Load more ({filteredJobs.length - displayLimit} remaining)
          </button>
        </div>
      )}

      {/* Clear jobs modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowClearModal(false)}>
          <div className="w-80 rounded-xl border border-border/30 bg-popover p-4 shadow-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-semibold">Clear Jobs</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {jobs.length} job{jobs.length !== 1 ? 's' : ''} in history
              </p>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              disabled={isClearing}
              onClick={() => handleClear('all')}
            >
              Clear all {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            </Button>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or clear by date range:</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={clearFrom}
                  onChange={(e) => setClearFrom(e.target.value)}
                  className="flex-1 h-7 rounded-md border border-border bg-input px-2 text-xs text-foreground"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={clearTo}
                  onChange={(e) => setClearTo(e.target.value)}
                  className="flex-1 h-7 rounded-md border border-border bg-input px-2 text-xs text-foreground"
                  placeholder="To"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isClearing || (!clearFrom && !clearTo)}
                onClick={() => handleClear('range')}
              >
                {(clearFrom || clearTo) ? `Clear ${clearRangeCount} job${clearRangeCount !== 1 ? 's' : ''} in range` : 'Clear range'}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowClearModal(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Delete proposal confirmation */}
      <Dialog open={confirmDeleteProposalId !== null} onOpenChange={(o) => !o && setConfirmDeleteProposalId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete proposal?</DialogTitle>
            <DialogDescription>
              This will permanently delete 1 proposal. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteProposalId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmDeleteProposalId) onProposalDelete?.(confirmDeleteProposalId)
                setConfirmDeleteProposalId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job comparison modal */}
      {compareJobIds && (
        <JobComparisonModal
          jobIds={compareJobIds}
          onClose={() => {
            setCompareJobIds(null)
            setCompareSelection([])
            setCompareMode(false)
          }}
        />
      )}
    </div>
  )
}
