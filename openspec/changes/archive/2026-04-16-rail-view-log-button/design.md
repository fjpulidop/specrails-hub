## Context

`RailControls.tsx` renders the Implement/Batch toggle and Play/Stop button for each rail. The parent (`DashboardPage`) passes `railJob` (`RailJobInfo | null`) down, which contains `jobId` and `status` when a job is active. Navigation to job detail already exists via `useNavigate` + `/jobs/:id` route.

Running status is visually communicated with dracula-cyan throughout the app (status dot, log viewer, dracula-colors.ts STATUS_COLORS).

## Goals / Non-Goals

**Goals:**
- Show a "View Log" icon button in RailControls only when `railJob?.status === 'running'`
- Navigate to `/jobs/${railJob.jobId}` on click (same tab)
- Match Dracula aesthetic: cyan color, subtle glow, consistent sizing with adjacent buttons

**Non-Goals:**
- No new API endpoints or server changes
- No polling or new WebSocket messages
- No support for completed/failed job links (button vanishes when rail stops)

## Decisions

**Conditional render via `railJob?.status === 'running'`**
Alternatives: also show when `'queued'`. Rejected — queued jobs have no meaningful log yet. Only `'running'` has live output worth viewing.

**Same-tab navigation with `useNavigate`**
Alternative: `window.open` / new tab. Rejected per user requirement — they want to go to the page, not open a new tab.

**Position: left of Implement/Batch toggle**
Keeps the destructive (Stop) button rightmost, log button leftmost — natural left-to-right reading order for context → action.

**Icon: `ScrollText` from lucide-react**
Alternatives: `Terminal`, `FileText`, `Logs`. `ScrollText` is semantically closest to a scrolling log. Lucide already used throughout the app.

**Color: `text-dracula-cyan` + `hover:shadow-[0_0_8px_hsl(191_97%_77%/0.4)]`**
Cyan is the established running-state color in this app. Glow on hover gives it life without being heavy. Matches the running dot indicator style.

## Risks / Trade-offs

`railJob` is passed as prop from DashboardPage — if prop drilling becomes unwieldy in future, move to rail context. Not a concern now (already a prop).

## Migration Plan

Single file change: `RailControls.tsx`. No migration needed.
