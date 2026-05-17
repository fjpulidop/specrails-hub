## 1. Context migration

- [x] 1.1 Define `SidebarMode` type and constants in `client/src/context/SidebarPinContext.tsx`
- [x] 1.2 Replace `leftPinned` / `rightPinned` booleans with `leftMode` / `rightMode` state, defaulting to `'unpinned'`
- [x] 1.3 Add `cycleLeftMode` / `cycleRightMode` helpers implementing the cycle `pinned-open → pinned-collapsed → unpinned → pinned-open`
- [x] 1.4 Expose `setLeftMode` / `setRightMode` setters (escape hatch for tests / palette)
- [x] 1.5 Read initial mode from `localStorage['specrails-hub:sidebar-mode:left']` and `:right`, with tolerant fallback to `'unpinned'` for missing or invalid values
- [x] 1.6 Persist mode to `localStorage` on every change, wrapped in `try/catch` so write failures don't break the UI

## 2. Left sidebar (`ArcSidebar`)

- [x] 2.1 Replace `useSidebarPin().leftPinned` consumption with `leftMode`, `cycleLeftMode`
- [x] 2.2 Derive `expanded = leftMode === 'pinned-open' || (leftMode === 'unpinned' && hovered)`
- [x] 2.3 Gate `onMouseEnter` / `onMouseLeave` on `leftMode === 'unpinned'` (no-op in `pinned-collapsed` and `pinned-open`)
- [x] 2.4 Update pin button styles: lit when `leftMode !== 'unpinned'`, dim when `leftMode === 'unpinned'`
- [x] 2.5 Wire pin button `onClick` to `cycleLeftMode()`
- [x] 2.6 Update `aria-label` and `title` to reflect the next action (collapse / unpin / pin open) plus the keyboard shortcut hint

## 3. Right sidebar (`ProjectRightSidebar`)

- [x] 3.1 Repeat steps 2.1–2.6 for `ProjectRightSidebar` using `rightMode` / `cycleRightMode`

## 4. Keyboard shortcuts (`App.tsx`)

- [x] 4.1 Replace the left sidebar shortcut handler with `cycleLeftMode()` (keep current key binding `⌥⌘B`)
- [x] 4.2 Replace the right sidebar shortcut handler with `cycleRightMode()` (keep current key binding `⌘B`)

## 5. Command Palette

- [x] 5.1 Update `CommandPalette` toggle entries to call `cycleLeftMode` / `cycleRightMode` instead of `setLeftPinned(p => !p)` / `setRightPinned(p => !p)`
- [x] 5.2 Update entry labels if needed so they describe a cycle, not a binary toggle

## 6. Tests

- [x] 6.1 Update `test-utils.tsx` `SidebarPinProvider` wrapper if assertions on initial state break
- [x] 6.2 Update `ArcSidebar.test.tsx` to drive the three modes and assert: width on `pinned-open`, no expansion on hover in `pinned-collapsed`, expansion on hover in `unpinned`, pin button label per mode
- [x] 6.3 Update `ProjectRightSidebar.test.tsx` with the same coverage
- [x] 6.4 Update `ProjectNavbar.test.tsx` and any other test referencing the old pin label
- [x] 6.5 Add a test for `localStorage` persistence (mode survives provider remount) and tolerant fallback (invalid stored value resolves to `unpinned`)
- [x] 6.6 Add a `CommandPalette` test that activating the toggle entry advances the mode through the cycle

## 7. Verification

- [x] 7.1 `cd client && npx tsc --noEmit` passes
- [x] 7.2 `npm test` passes
- [x] 7.3 `cd client && npm run test:coverage` passes the 80% lines/statements + 70% functions thresholds
- [ ] 7.4 Manual smoke: cycle both sidebars via pin button and keyboard; reload and confirm mode persists; verify hover only reveals in `unpinned`
