import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Loader2, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import type { EventRow, JobSummary } from '../types'

function formatWallClock(startedAt: string, finishedAt: string | number): string {
  const endMs = typeof finishedAt === 'number' ? finishedAt : new Date(finishedAt).getTime()
  const ms = endMs - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  if (mins < 60) return `${mins}m ${s}s`
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return `${hrs}h ${m}m`
}

interface PipelineTotals {
  totalCostUsd: number
  totalTokensIn: number
  totalTokensOut: number
  totalTokensCacheRead: number
  totalTokensCacheCreate: number
  jobCount: number
}

interface JobStatusPanelProps {
  job: JobSummary
  events: EventRow[]
  defaultOpen?: boolean
  pipelineTotals?: PipelineTotals
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

interface LiveAggregate {
  turns: number
  tokens: number
  lastSeenIdx: number
}

const INITIAL_AGG: LiveAggregate = { turns: 0, tokens: 0, lastSeenIdx: 0 }

type AggAction =
  | { type: 'reset' }
  | { type: 'consume'; events: EventRow[] }

function aggReducer(state: LiveAggregate, action: AggAction): LiveAggregate {
  if (action.type === 'reset') return INITIAL_AGG
  if (action.type === 'consume') {
    const { events } = action
    if (events.length <= state.lastSeenIdx) return state
    let { turns, tokens } = state
    for (let i = state.lastSeenIdx; i < events.length; i++) {
      const ev = events[i]
      if (ev.event_type !== 'assistant') continue
      turns += 1
      try {
        const payload = JSON.parse(ev.payload) as
          | {
              message?: {
                usage?: {
                  input_tokens?: number
                  output_tokens?: number
                  cache_read_input_tokens?: number
                  cache_creation_input_tokens?: number
                }
              }
            }
          | undefined
        const usage = payload?.message?.usage
        const n = (v: unknown): number => (typeof v === 'number' ? v : 0)
        // NOTE: this is a deliberately rough LIVE indicator — per-frame usage
        // re-includes the re-sent context each turn, so summing over-counts.
        // It is labelled approximate in the UI and is replaced by the
        // authoritative job.tokens_* totals at exit.
        tokens +=
          n(usage?.input_tokens) +
          n(usage?.output_tokens) +
          n(usage?.cache_read_input_tokens) +
          n(usage?.cache_creation_input_tokens)
      } catch {
        // unparseable assistant payload — count the turn, skip token math
      }
    }
    return { turns, tokens, lastSeenIdx: events.length }
  }
  return state
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'zombie_terminated', 'skipped'])

export function JobStatusPanel({
  job,
  events,
  defaultOpen = true,
  pipelineTotals,
}: JobStatusPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const modifiedFiles = useMemo(() => extractModifiedFiles(events), [events])

  const isRunning = job.status === 'running'
  const isSuccess = job.status === 'completed'
  const isTerminal = TERMINAL_STATUSES.has(job.status)

  // Live duration tick (every 1s) while running.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isRunning])

  // Incremental Turns/Tokens accumulator. Reset on job.id change.
  const [agg, dispatch] = useReducer(aggReducer, INITIAL_AGG)
  const lastJobIdRef = useRef<string>(job.id)
  useEffect(() => {
    if (lastJobIdRef.current !== job.id) {
      lastJobIdRef.current = job.id
      dispatch({ type: 'reset' })
    }
    dispatch({ type: 'consume', events })
  }, [job.id, events])

  // Authoritative values once available; live values otherwise.
  const liveTurns = job.num_turns ?? (isTerminal ? null : agg.turns)
  // Real total tokens = fresh input + output + cache-read + cache-create. The
  // cache tiers (especially cache_read) typically dominate agentic Claude runs,
  // so omitting them understated the figure by an order of magnitude.
  const liveTokens =
    job.tokens_in != null
      ? (job.tokens_in ?? 0) +
        (job.tokens_out ?? 0) +
        (job.tokens_cache_read ?? 0) +
        (job.tokens_cache_create ?? 0)
      : isTerminal
        ? null
        : agg.tokens
  // Live (still-running) figures are rough: tokens sum per-frame usage (which
  // re-includes re-sent context) and turns count assistant frames, not CLI
  // turns. Both are replaced by authoritative server values at job exit; mark
  // them with a ~ while live so the visible jump at exit is not surprising.
  const tokensApproximate = job.tokens_in == null && !isTerminal && liveTokens != null
  const turnsApproximate = job.num_turns == null && !isTerminal && liveTurns != null

  const durationDisplay = job.finished_at
    ? formatWallClock(job.started_at, job.finished_at)
    : isRunning
      ? formatWallClock(job.started_at, now)
      : '—'

  const headerLabel = isRunning ? 'Job in progress' : isSuccess ? 'Job completed' : 'Job failed'

  const frameClass = isRunning
    ? 'border-accent-info/20 bg-accent-info/5'
    : isSuccess
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-red-500/20 bg-red-500/5'

  const HeaderIcon = isRunning ? Loader2 : isSuccess ? CheckCircle2 : XCircle
  const headerIconClass = isRunning
    ? 'w-4 h-4 text-accent-info shrink-0 animate-spin'
    : isSuccess
      ? 'w-4 h-4 text-emerald-400 shrink-0'
      : 'w-4 h-4 text-red-400 shrink-0'

  // Codex (and any non-native-cost provider) cost is a pricing-table estimate;
  // prefix `~` so it is never read as a provider-billed figure.
  const costEstimated = !!job.total_cost_usd_estimated
  const costDisplay =
    job.total_cost_usd != null ? `${costEstimated ? '~' : ''}$${job.total_cost_usd.toFixed(4)}` : '—'
  const costDimmed = job.total_cost_usd == null

  return (
    <div className={cn('mx-4 my-2 rounded-xl border', frameClass)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3"
      >
        <HeaderIcon className={headerIconClass} aria-hidden="true" />
        <span className="text-sm font-semibold flex-1 text-left">{headerLabel}</span>

        {/* Quick stat chips */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{durationDisplay}</span>
          {!costDimmed ? (
            <span className="tabular-nums text-yellow-400">{costDisplay}</span>
          ) : (
            <span className="tabular-nums">—</span>
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
            <SummaryMetric label="Duration" value={durationDisplay} />
            <SummaryMetric
              label="Cost"
              value={costDisplay}
              valueClass={costDimmed ? 'text-muted-foreground' : 'text-yellow-400'}
            />
            <SummaryMetric
              label="Turns"
              value={liveTurns != null ? `${turnsApproximate ? '~' : ''}${liveTurns}` : '—'}
            />
            <SummaryMetric
              label="Tokens"
              value={liveTokens != null ? `${tokensApproximate ? '~' : ''}${(liveTokens / 1000).toFixed(1)}k` : '—'}
            />
          </div>

          {/* Pipeline total */}
          {pipelineTotals && (
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">
                Pipeline total ({pipelineTotals.jobCount} phases)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SummaryMetric
                  label="Total cost"
                  value={`$${pipelineTotals.totalCostUsd.toFixed(4)}`}
                  valueClass="text-yellow-400"
                />
                <SummaryMetric
                  label="Total tokens"
                  value={`${((pipelineTotals.totalTokensIn +
                    pipelineTotals.totalTokensOut +
                    pipelineTotals.totalTokensCacheRead +
                    pipelineTotals.totalTokensCacheCreate) / 1000).toFixed(1)}k`}
                />
              </div>
            </div>
          )}

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
