## Context

The current title bar (`TitleBar.tsx`) runs with `decorations: false` on all platforms, rendering custom Windows-style window control buttons (minimize, maximize, close) on the right side. On macOS this feels out of place. Tauri v2 supports `titleBarStyle: "Overlay"` which renders native macOS traffic light buttons while keeping the webview at full size. The existing `CommandPalette` component already handles Cmd+K globally via a `keydown` listener.

## Goals / Non-Goals

**Goals:**
- Native macOS traffic lights via `titleBarStyle: "Overlay"` in Tauri config
- Compact 28px title bar height, flush with traffic light circle size
- Centered search pill showing active project name, opening Cmd+K on click
- Windows/Linux layout fully unchanged

**Non-Goals:**
- Command palette redesign or new search features
- Full-screen / stage manager edge cases
- Windows traffic light parity

## Decisions

### 1. Platform detection: `navigator.platform`
**Decision:** Use `isTauriEnv() && /mac/i.test(navigator.platform)` to detect macOS inside the Tauri shell.

**Why:** `navigator.windowControlsOverlay` is a PWA/Chrome API not exposed in Tauri WebViews — it always returns `undefined`. Since `titleBarStyle: "Overlay"` is set in the Tauri config and only activates on macOS, "is Tauri + is Mac" is the correct and reliable signal. `navigator.platform` is always available in the Tauri WebView.

**Alternatives considered:**
- `navigator.windowControlsOverlay?.visible` — not available in Tauri WebView; always undefined
- `@tauri-apps/plugin-os` — requires adding a plugin; overkill for a boolean flag

### 2. Cmd+K trigger: synthetic KeyboardEvent
**Decision:** Dispatch `new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })` on the window when the pill is clicked.

**Why:** `CommandPalette` already listens for exactly this event. No prop drilling, no new context, no API surface changes. The connection is zero-coupling.

**Alternatives considered:**
- Expose `openPalette()` via React context — adds API surface; overkill since the event bus already exists
- Lift state to App — increases prop depth through TitleBar's tree

### 3. Title bar height: 28px
**Decision:** Shrink from 38px to 28px on macOS overlay.

**Why:** macOS traffic light circles are 12px diameter at y≈8px. A 28px bar aligns the pill vertically with the circles, giving a tight native feel. 38px leaves excess vertical space above/below the circles.

### 4. Search pill width: fluid with max-width cap
**Decision:** `width: 40%; max-width: 360px; min-width: 160px` centered via `position: absolute; left: 50%; transform: translateX(-50%)`.

**Why:** Absolute centering relative to the full bar keeps the pill centered regardless of traffic light size. The cap prevents overlap with traffic lights on narrow windows (`minWidth: 900` in config → min safe width is ~160px after subtracting ~72px left + some right padding).

## Risks / Trade-offs

- **`windowControlsOverlay` API availability** → It's a web standard available in Chromium-based WebViews (Tauri uses Chromium). If it's undefined, `?.visible` safely returns `undefined` (falsy). Low risk.
- **Full-screen mode** → In macOS full-screen, traffic lights move to a different position. The drag region stays correct; visual alignment may shift slightly. Acceptable for v1.
- **Project name overflow** → Long project names truncate with `text-overflow: ellipsis`. Max width cap prevents layout breaks.
