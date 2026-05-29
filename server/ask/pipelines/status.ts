// Status pipeline — aggregates SQL over tickets, jobs, ai_invocations,
// file_provenance, job_profiles, and (optionally) git to answer
// "how is the project going?".

import type { DbInstance } from '../../db'
import type { AskPipelineContext, RankedSource } from '../types'
import { getSpending } from '../../spending'
import { readStore, resolveTicketStoragePath } from '../../ticket-store'

const WEEK_MS = 7 * 86400_000

export interface StatusInputs {
  db: DbInstance
  projectId: string
  projectPath: string
  question: string
}

export function runStatusPipeline(opts: StatusInputs): AskPipelineContext {
  const sinceWeek = Date.now() - WEEK_MS
  const sinceWeekIso = new Date(sinceWeek).toISOString()

  // Tickets — read JSON store, classify
  const ticketsSection = (() => {
    try {
      const store = readStore(resolveTicketStoragePath(opts.projectPath))
      const shipped: Array<{ id: number; title: string; updated_at: string }> = []
      const inProgress: Array<{ id: number; title: string; updated_at: string }> = []
      const stalled: Array<{ id: number; title: string; updated_at: string }> = []
      for (const t of Object.values(store.tickets)) {
        const updated = Date.parse(t.updated_at)
        if (!Number.isFinite(updated)) continue
        const status = t.status as string
        if (status === 'done' && updated >= sinceWeek) shipped.push({ id: t.id, title: t.title, updated_at: t.updated_at })
        else if (status === 'in_progress') inProgress.push({ id: t.id, title: t.title, updated_at: t.updated_at })
        else if ((status === 'todo' || status === 'in_progress') && updated < sinceWeek) stalled.push({ id: t.id, title: t.title, updated_at: t.updated_at })
      }
      shipped.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      inProgress.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      stalled.sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
      return { shipped: shipped.slice(0, 10), inProgress: inProgress.slice(0, 5), stalled: stalled.slice(0, 5) }
    } catch {
      return { shipped: [], inProgress: [], stalled: [] }
    }
  })()

  // Jobs counts this week
  const jobsRow = opts.db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM jobs WHERE finished_at >= ? GROUP BY status`,
    )
    .all(sinceWeekIso) as Array<{ status: string; n: number }>
  const jobsByStatus: Record<string, number> = {}
  for (const r of jobsRow) jobsByStatus[r.status] = r.n

  // Spending via the canonical aggregator
  const spending = safeGetSpending(opts.db, opts.projectId)

  // File hotspots
  let hotspots: Array<{ file_path: string; n: number }> = []
  try {
    hotspots = opts.db
      .prepare(
        `SELECT file_path, COUNT(*) AS n FROM file_provenance
         WHERE at >= ?
         GROUP BY file_path
         ORDER BY n DESC LIMIT 5`,
      )
      .all(sinceWeekIso) as Array<{ file_path: string; n: number }>
  } catch {
    hotspots = []
  }

  // Sources: every shipped ticket gets a citation slot, and stalled tickets too.
  const sources: RankedSource[] = []
  for (const t of [...ticketsSection.shipped, ...ticketsSection.stalled]) {
    sources.push({
      rowid: -t.id, // synthetic — citations use sourceIdx not rowid here
      kind: 'ticket',
      source_id: `ticket:${t.id}`,
      title: t.title,
      body: '',
      ts: Date.parse(t.updated_at),
      ticket_id: String(t.id),
      score: 0,
    })
  }

  // Render the aggregate context as Markdown for the LLM
  const lines: string[] = []
  lines.push(`# Status — last 7 days (since ${sinceWeekIso.slice(0, 10)})`)
  lines.push('')
  lines.push(`## Tickets`)
  lines.push(`- Shipped: ${ticketsSection.shipped.length}`)
  for (const t of ticketsSection.shipped) lines.push(`  - [${sources.findIndex((s) => s.ticket_id === String(t.id)) + 1}] #${t.id} ${t.title}`)
  lines.push(`- In progress: ${ticketsSection.inProgress.length}`)
  for (const t of ticketsSection.inProgress) lines.push(`  - #${t.id} ${t.title}`)
  lines.push(`- Stalled (>7d no update): ${ticketsSection.stalled.length}`)
  for (const t of ticketsSection.stalled) lines.push(`  - [${sources.findIndex((s) => s.ticket_id === String(t.id)) + 1}] #${t.id} ${t.title}`)
  lines.push('')
  lines.push(`## Jobs`)
  lines.push(`- Total: ${Object.values(jobsByStatus).reduce((a, b) => a + b, 0)}`)
  for (const [k, v] of Object.entries(jobsByStatus)) lines.push(`  - ${k}: ${v}`)
  lines.push('')
  lines.push(`## Spending`)
  if (spending) {
    lines.push(`- Total this period: $${spending.summary.totalCostUsd.toFixed(2)}`)
    if (spending.summary.deltaPct !== null) {
      lines.push(`- Δ vs previous period: ${spending.summary.deltaPct > 0 ? '+' : ''}${spending.summary.deltaPct.toFixed(1)}%`)
    }
    lines.push(`- By surface:`)
    for (const s of spending.bySurface) lines.push(`  - ${s.surface}: $${s.costUsd.toFixed(2)} (${s.count} runs)`)
  } else {
    lines.push(`- (unavailable)`)
  }
  lines.push('')
  if (hotspots.length > 0) {
    lines.push(`## File hotspots (last 7 days)`)
    for (const h of hotspots) lines.push(`- ${h.file_path} (${h.n} touches)`)
  }

  return {
    question: opts.question,
    intent: 'status',
    sources,
    aggregateContext: lines.join('\n'),
  }
}

function safeGetSpending(db: DbInstance, projectId: string) {
  try {
    return getSpending(db, projectId, { period: '7d' })
  } catch {
    return null
  }
}

