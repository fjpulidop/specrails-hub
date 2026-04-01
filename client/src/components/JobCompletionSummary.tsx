import { useState, useMemo } from 'react'
import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'
import type { JobSummary, EventRow } from '../types'

function formatWallClock(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  if (mins < 60) return `${mins}m ${s}s`
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return `${hrs}h ${m}m`
}

interface JobCompletionSummaryProps {
  job: JobSummary
  events: EventRow[]
  defaultOpen?: boolean
}

function extractModifiedFiles(events: EventRow[]): string[] {
  const files = new Set<string>()
  for (const ev of events) {
    if (ev.event_type !== 'log') continue
    try {
      const payload = JSON.parse(ev.payload) as { line?: string }
      const line = payload.line ?? ''
      const match = line.match(
        /(?:Writing|Editing|Created?|Updated?)\s+(?:file:\s*)?([\w./\-]+\.\w+)/i,
      )
      if (match) files.add(match[1])
    } catch {
      // skip unparseable events
    }
  }
  return Array.from(files).slice(0, 20)
}

export function JobCompletionSummary({
  job,
  events,
  defaultOpen = true,
}: JobCompletionSummaryProps) {
  const [open, setOpen] = useState(defaultOpen)
  const modifiedFiles = useMemo(() => extractModifiedFiles(events), [events])

  const isSuccess = job.status === 'completed'

  return (
    <div
      className={cn(
        'mx-4 my-2 rounded-xl border',
        isSuccess
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-red-500/20 bg-red-500/5',
      )}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3"
      >
        {isSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <span className="text-sm font-semibold flex-1 text-left">
          {isSuccess ? 'Job completed' : 'Job failed'}
        </span>

        {/* Quick stat chips */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {job.finished_at && (
            <span className="tabular-nums">{formatWallClock(job.started_at, job.finished_at)}</span>
          )}
          {job.total_cost_usd != null && (
            <span className="tabular-nums text-yellow-400">${job.total_cost_usd.toFixed(4)}</span>
          )}
          {modifiedFiles.length > 0 && (
            <span>
              {modifiedFiles.length} file{modifiedFiles.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground/40 transition-transform duration-150 shrink-0',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/20">
          {/* Metric cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            <SummaryMetric
              label="Duration"
              value={job.finished_at ? formatWallClock(job.started_at, job.finished_at) : '—'}
            />
            <SummaryMetric
              label="Cost"
              value={job.total_cost_usd != null ? `$${job.total_cost_usd.toFixed(4)}` : '—'}
              valueClass="text-yellow-400"
            />
            <SummaryMetric
              label="Turns"
              value={job.num_turns != null ? `${job.num_turns}` : '—'}
            />
            <SummaryMetric
              label="Tokens"
              value={
                job.tokens_in != null
                  ? `${(((job.tokens_in ?? 0) + (job.tokens_out ?? 0)) / 1000).toFixed(1)}k`
                  : '—'
              }
            />
          </div>

          {/* Modified files list */}
          {modifiedFiles.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">
                Files modified
              </p>
              <div className="flex flex-wrap gap-1.5">
                {modifiedFiles.map((f) => (
                  <code
                    key={f}
                    className="text-[10px] font-mono bg-muted/30 px-2 py-0.5 rounded text-cyan-400/80"
                  >
                    {f}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-muted/20 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums mt-0.5', valueClass)}>{value}</p>
    </div>
  )
}
