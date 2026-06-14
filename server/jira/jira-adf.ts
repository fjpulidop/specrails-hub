// Atlassian Document Format (ADF) helpers.
//
// Jira Cloud (REST v3) requires comment/description bodies in ADF JSON. Jira
// Server/Data Center (REST v2) expects a plain wiki-markup string. We keep a
// single internal "text" model and render it to either format at the client
// boundary (see jira-client.ts `bodyForDeployment`).

import type { JiraDeployment } from './types'

/** Build a minimal ADF document from plain text (newlines → paragraphs). */
export function textToAdf(text: string): unknown {
  const paragraphs = text.split('\n')
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((line) =>
      line.length === 0
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] }
    ),
  }
}

/** Render a body for the target deployment: ADF for Cloud v3, plain for DC v2. */
export function bodyForDeployment(text: string, deployment: JiraDeployment): unknown {
  return deployment === 'cloud' ? textToAdf(text) : text
}

/**
 * Deterministic, invisible idempotency marker embedded in a comment body. Jira
 * has no native comment idempotency, so before re-posting on retry we GET the
 * issue comments and skip if a comment already carries this marker.
 */
export function commentMarker(jobId: string, ticketId: number): string {
  return `[specrails:job=${jobId}:ticket=${ticketId}]`
}

/**
 * Idempotency marker for a user-initiated "discard / move-to" comment. The
 * `nonce` (captured at enqueue) makes each discard distinct so a later re-discard
 * of the same spec posts a fresh comment instead of being deduped away.
 */
export function discardCommentMarker(ticketId: number, nonce: string): string {
  return `[specrails:discard=${nonce}:ticket=${ticketId}]`
}

/** True when an ADF doc or wiki string already contains the given marker. */
export function bodyContainsMarker(body: unknown, marker: string): boolean {
  if (typeof body === 'string') return body.includes(marker)
  try {
    return JSON.stringify(body).includes(marker)
  } catch {
    return false
  }
}

/**
 * Flatten an ADF document (or plain string) back to text — used to read inbound
 * Jira descriptions/comments into the local cache.
 */
export function adfToText(body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  const out: string[] = []
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text)
    if (node.type === 'hardBreak') out.push('\n')
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
      // paragraph / block separators
      if (node.type === 'paragraph' || node.type === 'heading') out.push('\n')
    }
  }
  walk(body)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}
