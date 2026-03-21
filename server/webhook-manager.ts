import { createHmac } from 'crypto'
import type { DbInstance } from './db'
import { listWebhooksForProject } from './hub-db'
import type { WebhookRow, WebhookEvent } from './hub-db'

const WEBHOOK_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 3

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  projectId: string
  data: Record<string, unknown>
}

// ─── WebhookManager ───────────────────────────────────────────────────────────

export class WebhookManager {
  private _hubDb: DbInstance

  constructor(hubDb: DbInstance) {
    this._hubDb = hubDb
  }

  /**
   * Send a test ping to a single webhook (used by the test endpoint).
   */
  deliverTest(webhook: WebhookRow): void {
    const payload: WebhookPayload = {
      event: 'job.completed',
      timestamp: new Date().toISOString(),
      projectId: webhook.project_id ?? '*',
      data: { test: true, message: 'specrails-hub webhook test ping' },
    }
    setImmediate(() => {
      this._deliverWithRetry(webhook, payload).catch(() => {})
    })
  }

  /**
   * Deliver an event to all matching webhooks for a project.
   * Non-blocking: fires and forgets with retry logic.
   */
  deliver(projectId: string, event: WebhookEvent, data: Record<string, unknown>): void {
    const webhooks = listWebhooksForProject(this._hubDb, projectId)
    const matching = webhooks.filter((w) => {
      try {
        const events = JSON.parse(w.events) as string[]
        return events.includes(event)
      } catch {
        return false
      }
    })

    for (const webhook of matching) {
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        projectId,
        data,
      }
      // Fire-and-forget with retry; errors are swallowed after exhausting attempts
      setImmediate(() => {
        this._deliverWithRetry(webhook, payload).catch(() => {})
      })
    }
  }

  private async _deliverWithRetry(webhook: WebhookRow, payload: WebhookPayload, attempt = 1): Promise<void> {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'specrails-hub',
    }

    if (webhook.secret) {
      const sig = createHmac('sha256', webhook.secret).update(body).digest('hex')
      headers['X-Specrails-Signature'] = `sha256=${sig}`
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      })

      if (!res.ok && attempt < MAX_ATTEMPTS) {
        await delay(1000 * attempt)
        return this._deliverWithRetry(webhook, payload, attempt + 1)
      }
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await delay(1000 * attempt)
        return this._deliverWithRetry(webhook, payload, attempt + 1)
      }
    }
  }
}
