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
  readStore,
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

/**
 * Extract the parent epic from an issue. In modern Jira (company- and
 * team-managed) the epic is the issue's `parent`. We only treat the parent as an
 * epic when its issue type is Epic (when that info is present); otherwise we keep
 * the parent reference anyway (most spec-issues' parent is the epic).
 */
export function extractEpic(issue: JiraIssue): { key: string | null; name: string | null } {
  const parent = issue.fields.parent
  if (!parent?.key) return { key: null, name: null }
  const typeName = parent.fields?.issuetype?.name
  if (typeName && typeName.toLowerCase() !== 'epic') return { key: null, name: null }
  return { key: parent.key, name: parent.fields?.summary ?? parent.key }
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
    jira_epic_key: extractEpic(issue).key,
    jira_epic_name: extractEpic(issue).name,
  }
}

export interface MaterializeResult {
  changedLocalIds: number[]
  maxUpdatedMs: number
  upserted: number
  /** Store revision AFTER the write (== the prior revision when nothing changed
   *  and no write happened). The sync-manager passes this to the TicketWatcher's
   *  echo-suppression so a poll never triggers a full-board refresh/flicker. */
  revision: number
  /** True when the local store file was actually written this call. */
  wrote: boolean
}

/** Compare the Jira-derived content of two tickets, ignoring updated_at. */
function sameJiraContent(a: Ticket, b: Ticket): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.assignee === b.assignee &&
    (a.jira_key ?? null) === (b.jira_key ?? null) &&
    (a.jira_url ?? null) === (b.jira_url ?? null) &&
    (a.jira_epic_key ?? null) === (b.jira_epic_key ?? null) &&
    (a.jira_epic_name ?? null) === (b.jira_epic_name ?? null) &&
    a.labels.length === b.labels.length &&
    a.labels.every((l, i) => l === b.labels[i])
  )
}

/** Apply the frozen-id guard to a freshly mapped ticket (preserve local status). */
function applyFrozen(mapped: Ticket, existing: Ticket | undefined, frozen: boolean): Ticket {
  if (existing && frozen) {
    mapped.status = existing.status
    mapped.priority = existing.priority ?? mapped.priority
  }
  return mapped
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
  let maxUpdatedMs = conn.highWaterMs ?? 0

  // ── Pre-pass (no lock): decide whether ANYTHING actually changed ──────────
  // The high-water + 2-min overlap means most polls return issues that are
  // byte-identical to what we already cached. Writing the store anyway bumps its
  // revision and makes the file-watcher fire a full-board refresh → the every-60s
  // flicker. So when nothing changed we skip the write (and the broadcasts)
  // entirely and return the unchanged revision.
  const preStore = readStore(ticketFile)
  let anyChange = false
  for (const issue of issues) {
    const u = issue.fields.updated ? Date.parse(issue.fields.updated) : 0
    if (!Number.isNaN(u) && u > maxUpdatedMs) maxUpdatedMs = u
    const link = getLinkByIssueId(db, issue.id)
    if (!link) { anyChange = true; continue }
    if (issue.key && issue.key !== link.jiraKey) { anyChange = true; continue }
    const existing = preStore.tickets[String(link.localId)]
    if (!existing) { anyChange = true; continue }
    const mapped = applyFrozen(mapIssueToTicket(issue, link.localId, conn, existing), existing, frozenLocalIds.has(link.localId))
    if (!sameJiraContent(existing, mapped)) anyChange = true
  }
  if (!anyChange) {
    return { changedLocalIds: [], maxUpdatedMs, upserted: 0, revision: preStore.revision, wrote: false }
  }

  // ── Write pass (locked): persist only the tickets that actually changed ────
  const changedLocalIds: number[] = []
  const store = mutateStore(ticketFile, (s) => {
    for (const issue of issues) {
      let link = getLinkByIssueId(db, issue.id)
      if (!link) {
        const localId = Math.max(s.next_id, nextJiraLocalId(db))
        link = insertLinkWithId(db, {
          localId,
          jiraIssueId: issue.id,
          jiraKey: issue.key,
          jiraProjectId: conn.jiraProjectId,
          deployment: conn.deployment,
        })
        if (localId >= s.next_id) s.next_id = localId + 1
      } else if (issue.key && issue.key !== link.jiraKey) {
        // Issue moved/renamed — refresh the display key (link keyed on immutable id).
        db.prepare('UPDATE jira_links SET jira_key = ?, updated_at = ? WHERE jira_issue_id = ?').run(
          issue.key,
          new Date().toISOString(),
          issue.id
        )
      }

      const localId = link.localId
      const existing = s.tickets[String(localId)]
      const mapped = applyFrozen(mapIssueToTicket(issue, localId, conn, existing), existing, frozenLocalIds.has(localId))
      // Unchanged tickets are left exactly as-is — no reassignment (keeps their
      // updated_at) and no ticket_updated broadcast.
      if (existing && sameJiraContent(existing, mapped)) continue
      s.tickets[String(localId)] = mapped
      changedLocalIds.push(localId)
      updateLinkStatusCategory(db, issue.id, issueStatusCategory(issue))
    }
  })

  return { changedLocalIds, maxUpdatedMs, upserted: changedLocalIds.length, revision: store.revision, wrote: true }
}

function nextJiraLocalId(db: DbInstance): number {
  const row = db.prepare('SELECT MAX(local_id) AS maxId FROM jira_links').get() as { maxId: number | null }
  return (row.maxId ?? 0) + 1
}
