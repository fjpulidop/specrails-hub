import { Loader2 } from 'lucide-react'

/**
 * Status pill shown while an Ask query is in flight. Mirrors the
 * ExploreStatusPills UX with three stages keyed off the SSE event sequence:
 *
 *   1. Searching…   — between submit and the `sources` event
 *   2. Thinking…    — after `thinking` and before the first `token`
 *   3. (hidden)     — once the first token streams in
 */

export type AskStage = 'searching' | 'thinking' | 'streaming'

interface AskStatusPillProps {
  stage: AskStage
}

const STAGE_LABEL: Record<Exclude<AskStage, 'streaming'>, string> = {
  searching: 'Searching project…',
  thinking: 'Thinking…',
}

export function AskStatusPill({ stage }: AskStatusPillProps) {
  if (stage === 'streaming') return null
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-accent-info/10 text-accent-info px-3 py-1 text-[11px] font-medium"
      role="status"
      aria-live="polite"
      data-testid="ask-status-pill"
      data-stage={stage}
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      <span>{STAGE_LABEL[stage]}</span>
    </div>
  )
}

/**
 * Pretty per-intent badge. Renders nothing for the default `factual`/`search`
 * intents (every answer is already an "answer"; the badge would add noise).
 * Only surfaces when the router picked a specialised pipeline.
 */
export function IntentBadge({ intent }: { intent: string }) {
  const meta = INTENT_META[intent]
  if (!meta) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}
      title={meta.tooltip}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
      {meta.label}
    </span>
  )
}

const INTENT_META: Record<string, { label: string; cls: string; tooltip: string }> = {
  status: {
    label: 'Status',
    cls: 'bg-accent-info/15 text-accent-info',
    tooltip: 'Aggregated project status across tickets, jobs, spending',
  },
  decision: {
    label: 'Why',
    cls: 'bg-accent-highlight/15 text-accent-highlight',
    tooltip: 'Decision tracing across Explore turns + commits',
  },
  compare: {
    label: 'Compare',
    cls: 'bg-accent-warning/15 text-accent-warning',
    tooltip: 'Side-by-side aggregation',
  },
  // `factual` and `search` intentionally omitted — they're the default, so no
  // badge is rendered for them.
}
