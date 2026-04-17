/**
 * The canonical 15-beat timeline for the scripted hub-demo tour.
 *
 * openspec: hub-demo-scripted-tour (design.md §Decision 2)
 */

import type { TourSelectorKey } from './selectors'

export type Beat =
  | { id: string; kind: 'idle'; duration: number }
  | { id: string; kind: 'moveTo'; target: TourSelectorKey; duration: number }
  | { id: string; kind: 'click'; target: TourSelectorKey; duration: number }
  | { id: string; kind: 'type'; target: TourSelectorKey; text: string; duration: number }
  | { id: string; kind: 'wait'; duration: number }
  | { id: string; kind: 'action'; name: TourAction; duration: number }
  | { id: string; kind: 'fadeReset'; duration: number }

export type TourAction =
  | 'openProposeSpecModal'
  | 'closeProposeSpecModal'
  | 'showToast'
  | 'spawnNewSpecCard'
  | 'moveSpecToRail1'
  | 'markRail1Running'
  | 'openRail1Log'
  | 'appendLogLine'
  | 'resetAll'

/** The canonical spec description typed during Beat 05. */
export const TOUR_SPEC_DESCRIPTION =
  'Add JWT auth with refresh tokens and a rotating session cookie'

/** Total expected loop duration (ms), for the 2σ-reachable upper bound. */
export const TOUR_LOOP_DURATION_MS = 18_000

export const TOUR_TIMELINE: Beat[] = [
  // 01 — idle dashboard, cursor parked
  { id: '01-idle', kind: 'idle', duration: 1000 },

  // 02 — cursor glides to the Add Spec button
  { id: '02-move-to-add', kind: 'moveTo', target: 'addSpecButton', duration: 1200 },

  // 03 — click Add Spec; modal opens
  { id: '03-click-add', kind: 'click', target: 'addSpecButton', duration: 300 },
  { id: '03b-open-modal', kind: 'action', name: 'openProposeSpecModal', duration: 300 },

  // 04 — focus the textarea (visually, the cursor hovers there)
  { id: '04-focus-textarea', kind: 'moveTo', target: 'proposeSpecTextarea', duration: 400 },

  // 05 — typewriter description
  {
    id: '05-type-description',
    kind: 'type',
    target: 'proposeSpecTextarea',
    text: TOUR_SPEC_DESCRIPTION,
    duration: 2500,
  },

  // 06 — cursor to submit + click
  { id: '06a-move-to-submit', kind: 'moveTo', target: 'generateSpecButton', duration: 500 },
  { id: '06b-click-submit', kind: 'click', target: 'generateSpecButton', duration: 300 },

  // 07 — modal closes, toast appears, brief "generating" pause
  { id: '07a-close-modal', kind: 'action', name: 'closeProposeSpecModal', duration: 400 },
  { id: '07b-toast', kind: 'action', name: 'showToast', duration: 400 },
  { id: '07c-generating', kind: 'wait', duration: 1800 },

  // 08 — new spec card materialises in Specs column + toast transitions to success
  { id: '08-spawn-spec', kind: 'action', name: 'spawnNewSpecCard', duration: 700 },

  // 09 — spec slides Specs → Rail 1
  { id: '09-move-to-rail', kind: 'action', name: 'moveSpecToRail1', duration: 900 },

  // 10 — cursor to Play on Rail 1 + click
  { id: '10a-move-to-play', kind: 'moveTo', target: 'rail1PlayButton', duration: 500 },
  { id: '10b-click-play', kind: 'click', target: 'rail1PlayButton', duration: 300 },

  // 11 — status changes to running
  { id: '11-running', kind: 'action', name: 'markRail1Running', duration: 500 },

  // 12 — cursor to Logs on Rail 1 + click
  { id: '12a-move-to-logs', kind: 'moveTo', target: 'rail1LogButton', duration: 600 },
  { id: '12b-click-logs', kind: 'click', target: 'rail1LogButton', duration: 200 },

  // 13 — log drawer opens
  { id: '13-open-log', kind: 'action', name: 'openRail1Log', duration: 500 },

  // 14 — log lines tail in (the action is called repeatedly by the orchestrator)
  { id: '14-tail-log', kind: 'action', name: 'appendLogLine', duration: 4500 },

  // 15 — fade reset, loop
  { id: '15-reset', kind: 'fadeReset', duration: 900 },
  { id: '15b-reset-state', kind: 'action', name: 'resetAll', duration: 100 },
]
