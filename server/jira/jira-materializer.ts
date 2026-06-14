// Inbound materializer: Jira issues → `.specrails/local-tickets.json`.
//
// The local store stays the canonical read cache that specrails-core reads
// unchanged. This module performs a SURGICAL merge (never a wholesale rewrite):
// it only upserts tickets that have a Jira link and preserves every locally-
// created ticket (no jira link) untouched. It also:
//   - allocates Jira `#id`s from the UNION of the store's next_id and the
//     jira_links max, so Jira ids never collide with local specs;
//   - skips the `status` field for any ticket with a pending outbox op
//     ("frozen" ids) so an inbound poll never reverts a status we just wrote.

import type { DbInstance } from '../db'
import {
  mutateStore,
  resolveTicketStoragePath,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from '../ticket-store'
import { adfToText } from './jira-adf'
import { getLinkByIssueId, insertLinkWithId, updateLinkStatusCategory } from './jira-db'
import type { JiraConnection, JiraIssue, JiraStatusCategory } from './types'

const CANCEL_NAMES = ['won\'t do', 'wont do', 'cancelled', 'canceled', 'rejected', 'abandoned', 'invalid', 'duplicate', 'declined']

export function issueStatusCategory(issue: JiraIssue): JiraStatusCategory {
  const k = issue.fields.status?.statusCategory?.key
  return k === 'new' || k === 'done' ? k : 'indeterminate'
}

/** Map a Jira issue's status to a Specrails ticket status. */
export function mapStatus(issue: JiraIssue): TicketStatus {
  const cat = issueStatusCategory(issue)
  if (cat === 'new') return 'todo'
  if (cat === 'indeterminate') return 'in_progress'
  // done category: distinguish a cancelled/rejected resolution from a real ship.
  const name = (issue.fields.status?.name ?? '').toLowerCase()
  return CANCEL_NAMES.some((w) => name.includes(w)) ? 'cancelled' : 'done'
}

/** Map a Jira priority name to a Specrails priority (best-effort, defaults medium). */
export function mapPriority(name: string | undefined): TicketPriority {
  switch ((name ?? '').toLowerCase()) {
    case 'highest':
    case 'blocker':
    case 'critical':
      return 'critical'
    case 'high':
      return 'high'
    case 'low':
    case 'lowest':
    case 'trivial':
    case 'minor':
      return 'low'
    default:
      return 'medium'
  }
}

/** Build the issue's browser URL from the base URL + key. */
export function issueUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${key}`
}

/** Map a Jira issue to a full Ticket. `existing` preserves created_at and local-only fields. */
export function mapIssueToTicket(
  issue: JiraIssue,
  localId: number,
  conn: JiraConnection,
  existing?: Ticket
): Ticket {
  const now = new Date().toISOString()
  return {
    id: localId,
    title: issue.fields.summary || `(${issue.key})`,
    description: adfToText(issue.fields.description),
    status: mapStatus(issue),
    priority: mapPriority(issue.fields.priority?.name),
    labels: issue.fields.labels ?? [],
    assignee: issue.fields.assignee?.displayName ?? issue.fields.assignee?.emailAddress ?? null,
    prerequisites: existing?.prerequisites ?? [],
    metadata: existing?.metadata ?? {},
    comments: existing?.comments ?? [],
    attachments: existing?.attachments,
    origin_conversation_id: existing?.origin_conversation_id ?? null,
    is_epic: existing?.is_epic ?? false,
    parent_epic_id: existing?.parent_epic_id ?? null,
    execution_order: existing?.execution_order ?? null,
    short_summary: existing?.short_summary ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    created_by: existing?.created_by ?? 'jira',
    source: 'jira',
    jira_key: issue.key,
    jira_url: issueUrl(conn.baseUrl, issue.key),
  }
}

export interface MaterializeResult {
  changedLocalIds: number[]
  maxUpdatedMs: number
  upserted: number
}

/**
 * Upsert a batch of Jira issues into the local store. `frozenLocalIds` is the set
 * of local ids whose `status` must NOT be overwritten by inbound data (they have
 * a pending outbox op or are on an active rail). Returns the changed local ids
 * and the max Jira `updated` timestamp seen (drives the high-water mark — derived
 * from Jira's own server timestamps, never the local clock).
 */
export function upsertIssuesIntoStore(
  db: DbInstance,
  projectPath: string,
  conn: JiraConnection,
  issues: JiraIssue[],
  frozenLocalIds: Set<number> = new Set()
): MaterializeResult {
  const ticketFile = resolveTicketStoragePath(projectPath)
  const changedLocalIds: number[] = []
  let maxUpdatedMs = conn.highWaterMs ?? 0
  let upserted = 0

  // Resolve/allocate links up-front (outside the store lock) so we know each
  // issue's local id. Allocation must be collision-safe vs the store's next_id,
  // so we do the actual minting inside the mutateStore callback below.
  mutateStore(ticketFile, (store) => {
    for (const issue of issues) {
      const updatedMs = issue.fields.updated ? Date.parse(issue.fields.updated) : 0
      if (!Number.isNaN(updatedMs) && updatedMs > maxUpdatedMs) maxUpdatedMs = updatedMs

      let link = getLinkByIssueId(db, issue.id)
      if (!link) {
        const localId = Math.max(store.next_id, nextJiraLocalId(db))
        link = insertLinkWithId(db, {
          localId,
          jiraIssueId: issue.id,
          jiraKey: issue.key,
          jiraProjectId: conn.jiraProjectId,
          deployment: conn.deployment,
        })
        if (localId >= store.next_id) store.next_id = localId + 1
      } else if (issue.key && issue.key !== link.jiraKey) {
        // Issue moved/renamed — refresh the display key (link keyed on immutable id).
        db.prepare('UPDATE jira_links SET jira_key = ?, updated_at = ? WHERE jira_issue_id = ?').run(
          issue.key,
          new Date().toISOString(),
          issue.id
        )
      }

      const localId = link.localId
      const existing = store.tickets[String(localId)]
      const mapped = mapIssueToTicket(issue, localId, conn, existing)
      // Frozen ids: keep the locally-authoritative status (an in-flight write).
      if (existing && frozenLocalIds.has(localId)) {
        mapped.status = existing.status
        mapped.priority = existing.priority ?? mapped.priority
      }
      store.tickets[String(localId)] = mapped
      changedLocalIds.push(localId)
      upserted++
      updateLinkStatusCategory(db, issue.id, issueStatusCategory(issue))
    }
  })

  return { changedLocalIds, maxUpdatedMs, upserted }
}

function nextJiraLocalId(db: DbInstance): number {
  const row = db.prepare('SELECT MAX(local_id) AS maxId FROM jira_links').get() as { maxId: number | null }
  return (row.maxId ?? 0) + 1
}
