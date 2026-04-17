/**
 * Demo fetch interceptor.
 *
 * Replaces window.fetch so that all `/api/*` requests return static fixture
 * data instead of hitting a real backend.  Installed once from demo-entry.tsx
 * before the React tree mounts.
 *
 * Runs the app in **hub mode** with a single fake project so the real
 * useTickets / useRails / useHub hooks produce the full dashboard instead
 * of the empty "No specs yet" state. Both legacy `/api/tickets` and the
 * hub-mode `/api/projects/<id>/tickets` variants are matched by the same
 * route patterns.
 */

import { demoTickets } from './fixtures/tickets'
import { demoJobs } from './fixtures/jobs'
import { demoAnalytics } from './fixtures/analytics'
import { demoActivity } from './fixtures/activity'
import { demoConfig } from './fixtures/config'
import type { HubProject } from '../hooks/useHub'

export const DEMO_PROJECT: HubProject = {
  id: 'demo-project-001',
  slug: 'my-saas-app',
  name: 'my-saas-app',
  path: '/Users/demo/code/my-saas-app',
  db_path: '/Users/demo/.specrails/projects/my-saas-app/jobs.sqlite',
  provider: 'claude',
  added_at: '2026-04-08T10:00:00Z',
  last_seen_at: '2026-04-17T12:00:00Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Matches both legacy `/api/<thing>` and hub `/api/projects/<id>/<thing>` shapes. */
const projectScoped = (suffix: string) =>
  new RegExp(`\\/api\\/(?:projects\\/[^/]+\\/)?${suffix}`)

const routes: Array<[RegExp, () => Response]> = [
  // ── Hub-level endpoints ───────────────────────────────────────────────
  [/\/api\/hub\/token$/, () => json({ token: 'demo-token' })],
  [
    /\/api\/hub\/state$/,
    () =>
      json({
        mode: 'hub',
        activeProjectId: DEMO_PROJECT.id,
        hubDailyBudget: null,
        hubDailySpend: 0,
      }),
  ],
  [
    /\/api\/hub\/projects(\b|\/)/,
    () => json({ projects: [DEMO_PROJECT], setupProjectIds: [] }),
  ],
  [/\/api\/hub\/cli-status/, () => json({ provider: 'claude', version: '1.0.0' })],
  [/\/api\/hub\/settings/, () => json({})],

  // ── Per-project endpoints (also match the legacy un-scoped variants) ──
  [projectScoped('tickets(\\/|\\?|$)'), () => json({ tickets: demoTickets })],
  [projectScoped('jobs(\\/|\\?|$)'), () => json({ jobs: demoJobs })],
  [projectScoped('propose'), () => json({ proposals: [] })],
  [projectScoped('analytics'), () => json(demoAnalytics)],
  [projectScoped('trends'), () => json({ period: '7d', points: [] })],
  [projectScoped('activity'), () => json(demoActivity)],
  [projectScoped('config$'), () => json(demoConfig)],
  [projectScoped('rails(\\/|\\?|$)'), () => json({ rails: [], activeJobs: {} })],
  [projectScoped('chat'), () => json({ conversations: [] })],

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

    if (url.includes('/api/')) {
      for (const [pattern, handler] of routes) {
        if (pattern.test(url)) {
          return Promise.resolve(handler())
        }
      }
    }

    return origFetch(input, init)
  }
}
