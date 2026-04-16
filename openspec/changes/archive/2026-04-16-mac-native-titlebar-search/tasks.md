## 1. Tauri Config

- [x] 1.1 Add `"titleBarStyle": "Overlay"` to the window config in `src-tauri/tauri.conf.json`

## 2. TitleBar — macOS branch

- [x] 2.1 Add platform detection: `const isMacOverlay = navigator.windowControlsOverlay?.visible === true`
- [x] 2.2 When `isMacOverlay` is true, render a 28px drag region with no SR icon, no title, no custom buttons
- [x] 2.3 Read active project name from `useHub()` context inside `TitleBar`
- [x] 2.4 Render centered search pill: `position: absolute; left: 50%; transform: translateX(-50%)`; `width: 40%; max-width: 360px; min-width: 160px`; height ~20px; `border-radius: 9999px`
- [x] 2.5 Add search icon (lucide `Search`) left-aligned inside the pill
- [x] 2.6 Display active project name (or `"Search…"` placeholder when none) truncated with ellipsis
- [x] 2.7 Set `WebkitAppRegion: 'no-drag'` (via `style`) on the pill so it's clickable
- [x] 2.8 On pill click dispatch `new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })` to open command palette

## 3. TitleBar — Windows/Linux branch unchanged

- [x] 3.1 Verify existing 38px render path (SR icon + title + WinButtons) is untouched when `isMacOverlay` is false

## 4. Visual QA

- [ ] 4.1 Build and run Tauri app on macOS — confirm traffic lights appear, no custom buttons visible
- [ ] 4.2 Confirm pill is centered and vertically aligned with traffic light circles
- [ ] 4.3 Confirm clicking pill opens command palette
- [ ] 4.4 Confirm project name updates when switching projects
- [ ] 4.5 Confirm drag region moves the window (click-drag on non-pill area)
- [ ] 4.6 Confirm `"Search…"` placeholder shows when no project selected

