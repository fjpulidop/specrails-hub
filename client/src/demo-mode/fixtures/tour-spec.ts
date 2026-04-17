/**
 * Canonical spec payload produced by the tour during Beat 08 (spawnNewSpecCard).
 *
 * openspec: hub-demo-scripted-tour (tasks §4.2)
 */

import type { LocalTicket } from '../../types'

/** ID is used as a DOM selector (`[data-ticket-id="9999"]`) by tour.css. */
export const TOUR_NEW_SPEC_ID = 9999

export const TOUR_NEW_SPEC: LocalTicket = {
  id: TOUR_NEW_SPEC_ID,
  title: 'Add JWT auth with refresh tokens',
  description:
    'Add JWT auth with refresh tokens and a rotating session cookie. Support Google and GitHub providers; expire tokens after 30 days.',
  status: 'todo',
  priority: 'high',
  labels: ['auth', 'backend'],
  assignee: null,
  prerequisites: [],
  metadata: { effort_level: 'medium', area: 'authentication' },
  created_at: '2026-04-17T12:00:00Z',
  updated_at: '2026-04-17T12:00:00Z',
  created_by: 'specrails',
  source: 'propose-spec',
}
