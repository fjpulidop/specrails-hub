## Context

Both sidebars share a hover/pin pattern driven by `SidebarPinContext`. Current model is a boolean per side: when `pinned`, the sidebar stays expanded; when not, it renders as a rail and expands on hover via `onMouseEnter`/`onMouseLeave`. Width transitions live in Tailwind classes on the root `<div>` of each sidebar component (`w-52` ↔ `w-11`). The pin button visual state (`text-foreground bg-muted` vs muted/dim) is driven by the same boolean.

The two sidebars are visually and behaviourally symmetric. `CommandPalette` and `App.tsx` (keyboard shortcuts) drive the same setters. No server, route, or persistence layer participates today — pin state is in-memory only and resets on reload.

The proposal calls for a third mode (`pinned-collapsed`) that looks identical to `unpinned` (rail mini) but disables hover-reveal and keeps the pin icon lit. The state must persist across reloads.

## Goals / Non-Goals

**Goals:**
- Introduce `SidebarMode = 'pinned-open' | 'pinned-collapsed' | 'unpinned'` per sidebar.
- Single user-facing action (pin button click OR keyboard shortcut) cycles the three states deterministically.
- Hover-reveal works iff `mode === 'unpinned'`. In `pinned-collapsed`, mouse-enter does nothing.
- Visual: pin icon lit when `mode !== 'unpinned'` (covers both `pinned-open` and `pinned-collapsed`); dim only when `unpinned`.
- Persist per-sidebar mode in `localStorage` (key `specrails-hub:sidebar-mode:left` / `:right`). Restore on mount.
- Left and right sidebars independent. No coupling.

**Non-Goals:**
- Animating the hover-reveal differently in `pinned-collapsed` (it simply doesn't trigger).
- Per-project sidebar state. State is hub-wide.
- Persistence to server / hub_settings. `localStorage` is enough for v1.
- Surfacing a separate "lock" affordance — the single pin button must carry the cycle.
- Touch/mobile gesture support (the hub is desktop-first).

## Decisions

### 1. State shape: enum, not two booleans

Use `SidebarMode = 'pinned-open' | 'pinned-collapsed' | 'unpinned'`.

Alternative considered: keep `pinned: boolean` and add `hoverRevealDisabled: boolean`. Rejected — two booleans yield four combinations, one of which (`!pinned && hoverRevealDisabled` = rail mini that never reveals AND has no way to show without unsetting) is nonsensical and would require runtime guards. An enum makes illegal states unrepresentable.

### 2. Cycle order: `pinned-open → pinned-collapsed → unpinned → pinned-open`

Rationale: starting from a sidebar that's open, the most useful next state is "collapse but stay out of my way" (`pinned-collapsed`). One more click moves to the looser "let me peek with hover" (`unpinned`). A third click restores the full sidebar. This matches the user's stated intuition.

Alternative considered: `pinned-open → unpinned → pinned-collapsed → pinned-open`. Rejected — going `open → unpinned` first means the user temporarily gets hover-reveal, then a second click "locks" it; that ordering surprises users who clicked the pin button expecting collapse, not a hover-reveal flicker.

### 3. Pin button & keyboard shortcut share one cycle action

Expose `cycleLeftMode()` / `cycleRightMode()` from the context. Both the pin button `onClick` and the global keyboard handler call these. No alternative entry points for individual transitions in v1 — keeps the surface area minimal and the model easy to reason about.

Alternative considered: dedicated `setMode(mode)` plus a helper that picks the next mode. Rejected as YAGNI — no other consumer needs to jump directly to a specific mode today.

### 4. Hover-reveal gate

Existing handlers:

```tsx
onMouseEnter={() => { if (!pinned) setHovered(true) }}
onMouseLeave={() => { if (!pinned) setHovered(false) }}
const expanded = pinned || hovered
```

New equivalent:

```tsx
const isCollapsedRail = mode !== 'pinned-open'
onMouseEnter={() => { if (mode === 'unpinned') setHovered(true) }}
onMouseLeave={() => { if (mode === 'unpinned') setHovered(false) }}
const expanded = mode === 'pinned-open' || (mode === 'unpinned' && hovered)
```

Key subtlety: when the user cycles from `unpinned` while `hovered=true`, the next mode (`pinned-open`) renders correctly because `expanded` evaluates `mode === 'pinned-open'`. When cycling `pinned-collapsed → unpinned` while the cursor is over the rail, the user must move the cursor out and back in for the overlay to appear — acceptable because `setHovered` is only flipped on mouse events. We do not synthesise a hover state on cycle.

### 5. Persistence: `localStorage` with a tolerant reader

Keys: `specrails-hub:sidebar-mode:left`, `specrails-hub:sidebar-mode:right`. Initial value when missing / invalid / unparseable: `'unpinned'` (matches today's default of `pinned=false`). Reader validates against the enum; anything else returns the default and overwrites on next change. No migration step — old installs simply read missing keys and start at `unpinned`, identical to today's first-run UX.

Alternative considered: persist `null` for "never set" vs `'unpinned'`. Rejected as unnecessary nuance.

### 6. Visual distinction `pinned-collapsed` vs `unpinned`

Both render the same width (`w-11` rail). The only visual difference is the pin button:

- `pinned-open`, `pinned-collapsed`: `text-foreground bg-muted` (lit).
- `unpinned`: `text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50` (dim).

Tooltip / `aria-label` derived from current mode:

| Current mode       | aria-label                       | Next mode (after click)   |
|--------------------|----------------------------------|---------------------------|
| `pinned-open`      | "Collapse sidebar (keep pinned)" | `pinned-collapsed`        |
| `pinned-collapsed` | "Unpin sidebar"                  | `unpinned`                |
| `unpinned`         | "Pin sidebar open"               | `pinned-open`             |

Keyboard shortcut hint `(⌥⌘B)` / `(⌘B)` appended to the title.

### 7. Context API shape (BREAKING internal)

```tsx
type SidebarMode = 'pinned-open' | 'pinned-collapsed' | 'unpinned'

interface SidebarPinContextValue {
  leftMode: SidebarMode
  rightMode: SidebarMode
  cycleLeftMode: () => void
  cycleRightMode: () => void
  setLeftMode: (m: SidebarMode) => void   // escape hatch for tests / palette
  setRightMode: (m: SidebarMode) => void
}
```

`useSidebarPin()` remains the hook name. All call sites that read `leftPinned` / `rightPinned` must migrate. `CommandPalette` switches from `setLeftPinned(p => !p)` to `cycleLeftMode()`.

## Risks / Trade-offs

- **Discoverability of `pinned-collapsed`**: rail mini in `pinned-collapsed` looks identical to `unpinned` except for the pin icon brightness; users who don't read tooltips may not realise the third state exists. → Mitigation: tooltip on the pin button states the next action explicitly ("Collapse sidebar (keep pinned)" → "Unpin sidebar" → "Pin sidebar open"). Pin-icon brightness contrast (`text-foreground` vs `text-muted-foreground/40`) is intentionally high.

- **Cycle disorientation**: a user who wants `pinned-open` from `pinned-collapsed` must click twice. → Mitigation: cycle is short (3 states, max 2 clicks to any target) and consistent across pin button + shortcut. If feedback shows pain, future work could add a long-press / shift-click escape hatch — not in scope here.

- **Hover state stuck after cycle**: if the cursor was over the rail when the user cycles `pinned-collapsed → unpinned`, the user must move the cursor to trigger the overlay. → Mitigation: documented in §4. Synthesising hover on cycle is rejected — it would conflict with the explicit user intent of "I just unlocked it, I want to see it expand if I hover".

- **`localStorage` quota / private mode failures**: writes are best-effort; failures should not crash the UI. → Mitigation: wrap `localStorage.setItem` in `try/catch`. State stays in-memory for the session.

- **Breaking internal API surface**: tests and `CommandPalette` that read `leftPinned` will break the build. → Mitigation: the migration is mechanical; the type checker enumerates every call site. Done as part of this change in a single atomic commit.

## Migration Plan

1. Land the new context shape and the cycle helpers.
2. Migrate `ArcSidebar`, `ProjectRightSidebar`, `CommandPalette`, `App.tsx` shortcut handlers, and `test-utils.tsx` in the same change.
3. Update tests that asserted pin state by name.
4. No data migration. No rollback complexity — removing the change reverts to two booleans.

## Open Questions

- Do we want a fourth visual cue (e.g., subtle border / glyph badge) for `pinned-collapsed` on top of the icon brightness? Defer until user feedback; keeping v1 minimal.
