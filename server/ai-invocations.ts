import type { DbInstance } from './db'
import type { NormalisedResult } from './result-event'

export type Surface = 'job' | 'quick-spec' | 'explore-spec' | 'ai-edit'
export type InvocationStatus = 'success' | 'failed' | 'aborted'

const ALLOWED_SURFACES: ReadonlySet<Surface> = new Set([
  'job',
  'quick-spec',
  'explore-spec',
  'ai-edit',
])

export interface RecordInput extends NormalisedResult {
  id: string
  project_id: string
  surface: Surface
  surface_ref_id?: string | null
  ticket_id?: number | null
  conversation_id?: string | null
  status: InvocationStatus
  started_at: string
  finished_at?: string | null
}

export interface InvocationRow {
  id: string
  project_id: string
  surface: Surface
  surface_ref_id: string | null
  ticket_id: number | null
  conversation_id: string | null
  model: string | null
  status: InvocationStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  duration_api_ms: number | null
  tokens_in: number | null
  tokens_out: number | null
  tokens_cache_read: number | null
  tokens_cache_create: number | null
  total_cost_usd: number | null
  num_turns: number | null
  session_id: string | null
  created_at: string
}

export class InvalidSurfaceError extends Error {
  constructor(public readonly surface: string) {
    super(`Invalid surface: ${surface}`)
    this.name = 'InvalidSurfaceError'
  }
}

export function recordInvocation(db: DbInstance, input: RecordInput): void {
  if (!ALLOWED_SURFACES.has(input.surface)) {
    throw new InvalidSurfaceError(input.surface)
  }
  db.prepare(`
    INSERT INTO ai_invocations (
      id, project_id, surface, surface_ref_id, ticket_id, conversation_id,
      model, status, started_at, finished_at, duration_ms, duration_api_ms,
      tokens_in, tokens_out, tokens_cache_read, tokens_cache_create,
      total_cost_usd, num_turns, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.project_id,
    input.surface,
    input.surface_ref_id ?? null,
    input.ticket_id ?? null,
    input.conversation_id ?? null,
    input.model ?? null,
    input.status,
    input.started_at,
    input.finished_at ?? null,
    input.duration_ms ?? null,
    input.duration_api_ms ?? null,
    input.tokens_in ?? null,
    input.tokens_out ?? null,
    input.tokens_cache_read ?? null,
    input.tokens_cache_create ?? null,
    input.total_cost_usd ?? null,
    input.num_turns ?? null,
    input.session_id ?? null,
  )
}

export function updateTicketIdForConversation(
  db: DbInstance,
  conversationId: string,
  ticketId: number
): number {
  const result = db.prepare(
    `UPDATE ai_invocations SET ticket_id = ? WHERE conversation_id = ? AND ticket_id IS NULL`
  ).run(ticketId, conversationId)
  return result.changes
}

export function listInvocationsForConversation(
  db: DbInstance,
  conversationId: string
): InvocationRow[] {
  return db.prepare(
    `SELECT * FROM ai_invocations WHERE conversation_id = ? ORDER BY started_at ASC`
  ).all(conversationId) as InvocationRow[]
}

export function getTicketSpendingSummary(
  db: DbInstance,
  ticketId: number
): {
  totalCostUsd: number
  totalTurns: number
  activeDurationMs: number
  bySurface: Record<Surface, { count: number; costUsd: number }>
  totalRuns: number
} {
  const rows = db.prepare(
    `SELECT surface, status, total_cost_usd, num_turns, duration_ms
     FROM ai_invocations WHERE ticket_id = ?`
  ).all(ticketId) as Array<{
    surface: Surface
    status: InvocationStatus
    total_cost_usd: number | null
    num_turns: number | null
    duration_ms: number | null
  }>
  const bySurface: Record<Surface, { count: number; costUsd: number }> = {
    job: { count: 0, costUsd: 0 },
    'quick-spec': { count: 0, costUsd: 0 },
    'explore-spec': { count: 0, costUsd: 0 },
    'ai-edit': { count: 0, costUsd: 0 },
  }
  let totalCostUsd = 0
  let totalTurns = 0
  let activeDurationMs = 0
  for (const r of rows) {
    bySurface[r.surface].count += 1
    bySurface[r.surface].costUsd += r.total_cost_usd ?? 0
    totalCostUsd += r.total_cost_usd ?? 0
    totalTurns += r.num_turns ?? 0
    activeDurationMs += r.duration_ms ?? 0
  }
  return { totalCostUsd, totalTurns, activeDurationMs, bySurface, totalRuns: rows.length }
}
