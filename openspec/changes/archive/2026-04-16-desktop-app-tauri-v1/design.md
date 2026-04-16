## Context

specrails-hub is a three-layer monorepo: Express server (Node.js/CommonJS) on port 4200, React+Vite client (ESM) compiled to `client/dist/` and served as static files by Express, and a CLI bridge. The server manages multiple projects, spawns Claude CLI processes, and communicates via WebSocket.

The goal is to wrap this stack in a native desktop app. The server binary becomes a Tauri **sidecar** — a subprocess bundled with the app and managed by the Tauri shell. The WebView loads `http://localhost:4200` after the server confirms readiness.

## Goals / Non-Goals

**Goals:**
- Zero-dependency install: user downloads `.dmg`/`.exe`, opens it, specrails-hub works
- Frameless window with custom Dracula-themed titlebar
- SpecRails SR icon across all platforms
- Local dev workflow: `dev:desktop` uses Tauri + Vite HMR (no rebuild cycle)
- Graceful sidecar lifecycle: start on app open, shutdown on app close, watchdog if app crashes

**Non-Goals:**
- Code signing / notarization (future spec)
- GitHub Actions CI/CD for desktop builds (future spec)
- System tray, auto-start on login, auto-update (future specs)
- Deep links, native notifications (future specs)
- Linux AppImage/Snap packaging (can add later, same pattern)

## Decisions

### 1. Tauri 2.0 over Electron

**Decision**: Tauri 2.0.

**Rationale**: Electron bundles Chromium (~150MB) on top of our React app. Tauri uses the OS WebView (WKWebView on macOS, WebView2 on Windows) — final `.dmg` ~15-20MB vs ~200MB. Rust shell is minimal. The trade-off is a Rust toolchain requirement at build time (not runtime).

**Alternative considered**: Electron — rejected due to binary size and duplicated Chromium overhead.

### 2. Node.js SEA for server sidecar

**Decision**: Node.js 20 Single Executable Application (SEA) to compile the Express server.

**Rationale**: SEA is built into Node ≥20 (already required in `engines`), no extra dependencies. Produces a true native binary per platform. `pkg` is deprecated (Vercel abandoned it). `nexe` has poor maintenance. Electron as server host is over-engineered.

**Process**:
1. `esbuild` bundles `server/index.ts` + all deps into single `server-bundle.js` (CommonJS)
2. Node SEA config (`sea.json`) wraps it into a native executable
3. Output: `src-tauri/binaries/specrails-server-<target>` (Tauri sidecar naming convention)

**Alternative considered**: Ship Node.js runtime alongside app — reliable but adds ~80MB and Node version management complexity.

### 3. Frameless window + custom titlebar

**Decision**: Tauri `decorations: false` + React `TitleBar` component.

**Rationale**: Dracula aesthetic, consistent cross-platform look, matches the app's dark UI. The titlebar renders only when `window.__TAURI_INTERNALS__` is defined — no impact on browser/non-desktop usage.

Tauri provides `appWindow.startDragging()` for the drag region. Min/max/close call `appWindow.minimize()`, `appWindow.toggleMaximize()`, `appWindow.close()`.

### 4. Port strategy

**Decision**: Fixed port 4200, with conflict detection on startup.

**Rationale**: Keeps implementation simple for v1. If port 4200 is occupied, show an error dialog via Tauri dialog API rather than silently failing. Dynamic port allocation (pass port to WebView via Tauri state) adds complexity without clear user benefit at this stage.

### 5. Sidecar health check

**Decision**: Poll `GET http://localhost:4200/api/hub/state` (existing endpoint) every 500ms, 30s timeout.

**Rationale**: `/api/hub/state` is the first call the React app makes — if it returns 200, the server is ready. No need for a dedicated `/health` endpoint. 30s matches the existing zombie detection timeout pattern in the codebase.

## Risks / Trade-offs

- **Rust toolchain at build time** → Mitigation: document in CONTRIBUTING.md, `rustup` one-liner install
- **Node SEA experimental APIs** → Mitigation: pinned to Node 20 LTS; SEA is stable in 20.x for CommonJS bundles. `better-sqlite3` native addon needs special handling (pre-build for each platform target).
- **`better-sqlite3` native module in SEA** → Mitigation: `better-sqlite3` ships prebuilt binaries. esbuild marks it as external; the SEA asset system copies the `.node` file alongside the binary. Tauri sidecar config handles the path resolution.
- **Port 4200 conflict** → Mitigation: startup conflict check with user-friendly Tauri dialog error.
- **macOS Gatekeeper on unsigned binary** → Mitigation: documented workaround (right-click → Open) until code signing spec is implemented.

## Migration Plan

1. Add `src-tauri/` alongside existing directories — no changes to existing server/client code except TitleBar component
2. New npm scripts are additive — existing `dev`, `build`, `test` scripts unchanged
3. No database or API changes — sidecar runs the same server code
4. `TitleBar` component conditionally renders — existing web usage unaffected

## Open Questions

- Should `better-sqlite3` be replaced with `sql.js` (pure JS, no native addon) to simplify SEA bundling? Deferred — try native addon path first since it already works in CLI distribution.
- Icon design: SR lettermark on Dracula purple (`#6272a4` bg, `#f8f8f2` text)? Confirm with user before implementation.
