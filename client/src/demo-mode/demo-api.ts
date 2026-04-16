/**
 * Demo fetch interceptor.
 *
 * Replaces window.fetch so that all `/api/*` requests return static fixture
 * data instead of hitting a real backend.  Installed once from demo-entry.tsx
 * before the React tree mounts.
 */

import { demoTickets } from './fixtures/tickets'
import { demoJobs } from './fixtures/jobs'
import { demoAnalytics } from './fixtures/analytics'
import { demoActivity } from './fixtures/activity'
import { demoConfig } from './fixtures/config'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Route table: path pattern → handler */
const routes: Array<[RegExp, () => Response]> = [
  // Auth — return a dummy token (interceptor won't actually use it)
  [/\/api\/hub\/token$/, () => json({ token: 'demo-token' })],

  // Hub state — 404 forces legacy (single-project) mode
  [/\/api\/hub\/state$/, () => json({ error: 'not found' }, 404)],

  // CLI status — show Claude Code badge instead of "No AI CLI"
  [/\/api\/hub\/cli-status/, () => json({ provider: 'claude', version: '1.0.0' })],

  // Tickets
  [/\/api\/tickets/, () => json(demoTickets)],

  // Jobs
  [/\/api\/jobs/, () => json({ jobs: demoJobs })],

  // Proposals (shown on Jobs page)
  [/\/api\/propose/, () => json({ proposals: [] })],

  // Analytics
  [/\/api\/analytics/, () => json(demoAnalytics)],

  // Trends (analytics sub-chart)
  [/\/api\/trends/, () => json({ period: '7d', points: [] })],

  // Activity feed
  [/\/api\/activity/, () => json(demoActivity)],

  // Config / settings
  [/\/api\/config$/, () => json(demoConfig)],

  // Rails state (dashboard)
  [/\/api\/rails/, () => json({ activeJobs: {} })],

  // Chat — empty
  [/\/api\/chat/, () => json({ conversations: [] })],

  // Catch-all for any other /api call
  [/\/api\//, () => json({})],
]

export function installDemoFetchInterceptor(): void {
  const origFetch = window.fetch.bind(window)

  window.fetch = function demoFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    // Only intercept /api/* requests
    if (url.includes('/api/')) {
      for (const [pattern, handler] of routes) {
        if (pattern.test(url)) {
          return Promise.resolve(handler())
        }
      }
    }

    // Pass through everything else (CSS, JS, assets, etc.)
    return origFetch(input, init)
  }
}
