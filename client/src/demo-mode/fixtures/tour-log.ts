/**
 * Canonical log lines displayed during tour Beat 14.
 *
 * Colour tokens (see design.md §Decision 5):
 *   ✓ → dracula-green
 *   → → dracula-purple
 *   timestamps → muted-foreground
 *   trailing numbers/counts → dracula-cyan
 *   SHIPPED / PASS → dracula-green, bold
 *
 * openspec: hub-demo-scripted-tour (design.md §Decision 5)
 */

export interface TourLogLine {
  /** Monotonic id for React keys. */
  id: number
  /** Timestamp rendered in muted foreground (HH:MM:SS). */
  timestamp: string
  /** Leading marker: check for "done" lines, arrow for phase transitions. */
  marker: '✓' | '→'
  /** Main text, rendered in the default foreground. */
  text: string
}

export const TOUR_LOG_LINES: readonly TourLogLine[] = [
  { id: 1, timestamp: '17:16:42', marker: '✓', text: 'Environment Setup' },
  { id: 2, timestamp: '17:23:21', marker: '→', text: 'Phase 3a: Architect' },
  { id: 3, timestamp: '17:23:35', marker: '✓', text: 'OpenSpec artifacts created' },
  { id: 4, timestamp: '17:26:15', marker: '→', text: 'Phase 3b: Implement' },
  { id: 5, timestamp: '17:26:24', marker: '✓', text: 'Build passes · 5 files modified' },
  { id: 6, timestamp: '17:26:51', marker: '→', text: 'Phase 3c: Write Tests' },
  { id: 7, timestamp: '17:31:11', marker: '✓', text: '152 tests passing' },
  { id: 8, timestamp: '17:34:02', marker: '→', text: 'Phase 4b: Review' },
  { id: 9, timestamp: '17:39:10', marker: '✓', text: '3 warnings resolved' },
  { id: 10, timestamp: '17:39:32', marker: '→', text: 'Phase 4c: Ship' },
  { id: 11, timestamp: '17:40:39', marker: '✓', text: 'SHIPPED · confidence 87/100' },
]

/** Milliseconds between each line appearing during the tail beat. */
export const TOUR_LOG_LINE_INTERVAL_MS = 650
