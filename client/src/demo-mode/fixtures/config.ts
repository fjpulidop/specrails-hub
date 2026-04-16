import type { ProjectConfig } from '../../types'

export const demoConfig: ProjectConfig = {
  project: {
    name: 'my-saas-app',
    repo: 'https://github.com/acme/my-saas-app',
  },
  issueTracker: {
    github: { available: true, authenticated: true },
    jira: { available: false, authenticated: false },
    active: 'github',
    labelFilter: 'product-driven-backlog',
  },
  commands: [
    { id: 'cmd-1', name: 'implement', description: 'Implement a spec end-to-end', slug: 'implement', totalRuns: 12, lastRunAt: '2026-04-12T09:23:45Z' },
    { id: 'cmd-2', name: 'review', description: 'Review a pull request', slug: 'review', totalRuns: 6, lastRunAt: '2026-04-12T08:35:12Z' },
    { id: 'cmd-3', name: 'propose-feature', description: 'Propose a new feature from an idea', slug: 'propose-feature', totalRuns: 4, lastRunAt: '2026-04-11T16:48:30Z' },
    { id: 'cmd-4', name: 'enrich', description: 'Enrich a spec with details', slug: 'enrich', totalRuns: 2, lastRunAt: '2026-04-10T15:30:00Z' },
  ],
  dailyBudgetUsd: 5.0,
}
