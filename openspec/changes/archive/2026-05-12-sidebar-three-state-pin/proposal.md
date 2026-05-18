## Why

Today the left and right project sidebars are a two-state toggle: pinned-open (visible, takes layout) vs unpinned (rail mini, hover reveals overlay). Users who want the extra editor width but don't want the sidebar to flap open every time the cursor grazes the rail have no way to express that. There's no "leave it collapsed and don't hover-reveal" option.

## What Changes

- Replace the boolean `leftPinned` / `rightPinned` state with a tri-state `SidebarMode` (`pinned-open` | `pinned-collapsed` | `unpinned`) per sidebar, persisted to `localStorage`.
- Pin button cycles: `pinned-open → pinned-collapsed → unpinned → pinned-open`. Same cycle for the keyboard shortcuts (`⌘B` left, `⌥⌘B` right — unchanged keys, new behaviour).
- In `pinned-collapsed`, the rail mini renders the same as `unpinned` but hover does NOT expand the sidebar. The pin icon stays lit (active) to distinguish it from `unpinned` (icon dim).
- Tooltips, `aria-label`, and Command Palette entries updated to reflect the three-state cycle.
- **BREAKING (internal)**: `SidebarPinContext` shape changes — `leftPinned: boolean` becomes `leftMode: SidebarMode` (and same for right). All call sites must migrate.

## Capabilities

### New Capabilities
- `sidebar-pin-states`: tri-state pin model for left and right project sidebars, including hover-reveal gating, pin button cycle, keyboard shortcut cycle, and persistence.

### Modified Capabilities
<!-- None: prior sidebar behaviour was not captured in a dedicated spec. -->

## Impact

- `client/src/context/SidebarPinContext.tsx` — state shape changes from boolean to tri-state enum, adds `localStorage` persistence.
- `client/src/components/ArcSidebar.tsx` — hover handlers gated on `mode === 'unpinned'`; pin button cycles three states; lit/dim styling for `pinned-collapsed` vs `unpinned`.
- `client/src/components/ProjectRightSidebar.tsx` — same migration as ArcSidebar.
- `client/src/components/CommandPalette.tsx` — toggle entries call the cycle action instead of flipping a boolean.
- `client/src/App.tsx` — keyboard shortcut handlers call the cycle action; `SidebarPinProvider` mount point unchanged.
- `client/src/test-utils.tsx` and any test that wraps with `SidebarPinProvider` — no API break if the provider continues to accept `children`, but consumers asserting `leftPinned` need updates.
- Tests: `ArcSidebar.test.tsx`, `ProjectRightSidebar.test.tsx`, `ProjectNavbar.test.tsx` (any assertions over pin label/state).
- No server changes. No schema changes. No new dependencies.
