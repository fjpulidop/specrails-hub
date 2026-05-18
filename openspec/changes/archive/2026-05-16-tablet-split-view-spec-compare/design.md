## Context

`TicketDetailModal` is a 31KB centered modal mounted via `TicketDetailModalContext`. It hosts title/description editing, Contract Layer disclosure, Continue Explore, Implement actions, spending line, label management, and several side-effects (WS listeners, sonner toasts, draft-flip paths). The dashboard renders ToDo specs through one of four selectable views (`SpecsBoard`, `TicketGridView`, `TicketListView`, `TicketPostItView`). The user wants a tablet-grade compare experience: drag the modal to the screen edge, summon a picker on the opposite side using the **same** card components the dashboard uses, click a card to mount a second modal alongside, exit cleanly when a third spec enters the picture.

Constraints:
- Existing single-modal callers must keep working unchanged.
- No server changes; no new dependencies if avoidable.
- Coverage thresholds (client 80% lines/statements, 70% functions) must hold.
- Modal already has a close button (`×`) at `TicketDetailModal.tsx:280-283` — reuse, do not duplicate.

## Goals / Non-Goals

**Goals:**
- Symmetric drag-to-snap split with picker on the opposite edge.
- Picker mirrors the dashboard's *currently active* view component (grid/list/board/postit), filtered by status='todo' and respecting the dashboard's active filter chips and sort.
- Side B is a full second instance of `TicketDetailModal` (full parity, not a trimmed compare view).
- Discoverability via a "Comparar" toolbar button in addition to drag.
- URL-persisted split state (`?compare=<id>&compareSide=left|right`) restored on refresh.
- Animated 1:1 follow + spring snap at threshold and release.
- Resizable splitter starting at 50/50, ephemeral per session.
- Intra-spec link to a third ticket → split collapses, single modal opens.
- Disabled below 900px viewport.

**Non-Goals:**
- Persisting splitter ratio across sessions or projects.
- Comparing draft/done/in-progress specs.
- Trimmed compare view (we mount the full modal twice).
- Triple+ panel split.
- Mobile/touch compare UX below 900px.
- Backend changes (no new REST/WS/schema).

## Decisions

### D1. Context shape: extend, don't replace
`TicketDetailModalContext` becomes `{ leftTicketId: string | null, rightTicketId: string | null, originSide: 'left' | 'right' | null, splitRatio: number }`. The current API `openTicket(id)` continues to set `leftTicketId` with `originSide=null` (centered single-modal mode). New API: `enterSplit(side)`, `setComparedTicket(id, side)`, `exitSplit()`, `setSplitRatio(n)`. Non-split consumers are unaffected.

**Alternative considered:** a separate `CompareViewContext`. Rejected — splits the source of truth for "which ticket is active" and complicates third-spec auto-exit (would need cross-context coordination).

### D2. Picker = the active dashboard view component, embedded
Add a `mode?: 'picker'` prop to `SpecsBoard`, `TicketGridView`, `TicketListView`, `TicketPostItView`. In picker mode each view:
- Filters to `status='todo'` regardless of any internal filter state, on top of the dashboard's user-applied chips (intersection).
- Excludes `leftTicketId` and `rightTicketId` from the rendered set.
- Hides its own chrome (page header, filter chips strip — the dashboard's chrome stays on the dashboard behind the backdrop and is not re-rendered inside the modal). The view body (cards) remains intact.
- Disables drag-and-drop (no kanban moves from inside the picker).
- Emits `onSelectTicket(id)` on card click instead of opening a new modal.

A new tiny hook `useActiveDashboardView()` reads the persisted view choice from the existing dashboard preference store so the picker mirrors what the user sees in `/`.

**Alternative considered:** a custom `<SpecsPicker />` that wraps a single card list. Rejected — the user explicitly asked for "exactamente las mismas cards que en el dashboard"; a one-off picker would drift over time.

### D3. Drag gesture: pointer events on the modal header only
Drag listeners attach to the existing header element (where the title and `×` live), not the body — body retains text selection. Threshold = 20% of viewport width (`window.innerWidth * 0.20`). Crossing the threshold while dragging triggers `enterSplit(direction)`. Dropping below the threshold while in split mode triggers `exitSplit()`.

**Animation:** during drag, `transform: translateX(...)` follows the pointer 1:1. On threshold cross and on release, a spring (`transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)`) snaps to either the snapped position or the centered position. If framer-motion is already a dep (verify), prefer `motion.div` with `animate`; otherwise CSS transitions are sufficient.

**Alternative considered:** drag the whole modal body. Rejected — conflicts with text selection inside description editor.

### D4. URL persistence via existing route
Encode split state as query params on whatever the current route is (`?compare=<id>&compareSide=left|right`). On mount, `App.tsx` (or a new `useCompareUrlSync()` hook) reads the query, validates the ticket exists and is visible in the project, then calls `enterSplit(originSide)` + `setComparedTicket(compareId, oppositeSide)`. Unknown ticket id → silently clear param. Single-modal opens do not write query params (preserves current "no URL change on modal" behaviour from CLAUDE.md).

**Alternative considered:** localStorage persistence. Rejected — split is a navigational state ("I'm comparing X and Y"), not a preference.

### D5. Third-spec exit
Any navigation triggered from inside either panel (Continue Explore, intra-ticket link, ticket-mention deep-link, opening another ticket from within the modal body) is intercepted by `TicketDetailModalContext.openTicket(id)`. When `originSide !== null` and the new `id` is neither `leftTicketId` nor `rightTicketId`, the context calls `exitSplit()` first then sets `leftTicketId = id`. The user sees a brief animated collapse to center.

### D6. Side B close = back to picker; side A close = close all; backdrop = close all
- Header `×` on the panel that matches `originSide` (side A) → `closeAll()`.
- Header `×` on the opposite panel (side B) → `setComparedTicket(null, oppositeSide)` → picker re-mounts on that side.
- Click on the backdrop area outside both panels → `closeAll()` (preserves current behaviour).
- The splitter divider has its own click target (drag-to-resize); clicking the divider does nothing.

### D7. Splitter
Reuse the `useDashboardSplit` primitive when ergonomically possible; otherwise replicate the same drag pattern. Start at 0.5; clamp to `[0.25, 0.75]` so neither panel becomes unusable. Ratio is held in context state, not URL, not localStorage.

### D8. Side-effect isolation in double-mounted `TicketDetailModal`
Mounting `TicketDetailModal` twice risks double side-effects:
- **WS `ticket_updated` listeners** — already keyed by ticket id, safe.
- **Sonner toasts on Contract Refine etc.** — keyed by ticket id via toast id, deduped by sonner.
- **Hotkeys (Esc, Cmd+Enter)** — only the panel with focus should react. Add an `isFocused` derivation based on `document.activeElement` containment; the unfocused panel skips global key handlers.

### D9. Viewport gating
`useMediaQuery('(min-width: 900px)')` (or `window.matchMedia`) gates: drag listeners, "Comparar" button visibility, and URL hydration. Below 900px, the URL query is preserved but not applied; refreshing on a wider screen restores it.

## Risks / Trade-offs

- **[Double-mount perf]** → Modal is 31KB compiled; rendering twice doubles React reconciliation cost. Mitigation: memoize heavy children (`ContractLayerDisclosure`, `TicketSpendingLine`) with `React.memo`; profile with React DevTools after first integration pass.
- **[Picker view component coupling]** → `SpecsBoard`/`TicketGridView`/etc. may have route assumptions or context dependencies that break when embedded. Mitigation: audit each before adding `mode='picker'`; document any assumption fixed during the audit.
- **[Sonner toast collisions]** → Two modals could each fire a Contract Refine toast targeting the same ticket. Mitigation: toast ids already keyed by ticket id; verify dedup.
- **[Hotkey ambiguity]** → Esc with two modals open: side B closes first, then side A. Cmd+Enter saves the focused panel. Document the focus rule.
- **[URL leakage]** → A user copy-pasting a URL with `?compare=` shares a compare view. Mitigation: this is the intent (shareable comparison); document it.
- **[Drag vs scroll on trackpads]** → Horizontal two-finger scroll on the header could be misinterpreted as drag. Mitigation: only react to primary pointer down + move; ignore wheel events.
- **[Viewport resize mid-split]** → Resizing browser below 900px while in split mode. Mitigation: on resize-below-threshold, collapse to single modal (left panel wins), preserve URL param for when width recovers.
- **[Splitter accessibility]** → No ARIA today on splitters. Mitigation: add `role="separator"` + `aria-orientation="vertical"` + keyboard arrows in scope of this change.

## Open Questions

- Does framer-motion already exist as a client dep? If yes, use it; if no, decide whether the spring polish justifies adding it or whether CSS transitions suffice. (To verify during task execution.)
- Should the "Comparar" toolbar button open the picker immediately (no drag at all) or trigger the snap animation as if dragged? Default: trigger snap animation to the right (consistent visual feedback). Revisit if user feedback says otherwise.
- Should picker auto-scroll the dashboard's view scroll position into view, or always start at top? Default: start at top.
