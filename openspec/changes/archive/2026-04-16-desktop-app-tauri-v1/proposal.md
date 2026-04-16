## Why

specrails-hub is a web dashboard that requires users to run `npm install` + `npm run dev` from a terminal — a barrier for non-developer users (PMs, managers, teammates). Packaging it as a native desktop app enables zero-setup distribution: download, install, open, works.

## What Changes

- Add Tauri 2.0 shell (`src-tauri/`) wrapping the existing Express+React stack
- Compile Express server to a self-contained binary via Node.js SEA (Single Executable Application)
- Bundle the SEA binary as a Tauri sidecar process, started/stopped by the Tauri shell
- Add a frameless custom titlebar component (Dracula-themed) to the React client
- Add SpecRails SR icon in Dracula palette for all platforms (icns/ico/png)
- Add build scripts: `build:sidecar` (Node SEA) and `build:desktop` (sidecar + tauri build)
- Support Tauri dev mode pointing to Vite dev server (port 4201)

## Capabilities

### New Capabilities

- `desktop-shell`: Tauri 2.0 wrapper — window management, sidecar lifecycle, health check, watchdog, graceful shutdown
- `server-sidecar`: Node.js SEA compilation of the Express server into a platform-native binary bundled inside the app
- `desktop-titlebar`: Frameless custom titlebar with drag region, min/max/close buttons, Dracula theme

### Modified Capabilities

<!-- No existing spec-level requirements change — all existing server/client behavior is preserved as-is -->

## Impact

- **New directory**: `src-tauri/` (Rust project, not compiled by existing tsc/vite pipeline)
- **New build scripts** in root `package.json`: `build:sidecar`, `build:desktop`, `dev:desktop`
- **New React component**: `client/src/components/TitleBar.tsx` — only rendered when running inside Tauri (`window.__TAURI__`)
- **Dependencies**: Rust toolchain (external), `@tauri-apps/api` (client dep), `@tauri-apps/cli` (dev dep)
- **Port**: Express server stays on 4200; Tauri WebView loads `http://localhost:4200`
- **No breaking changes** to existing CLI, server API, or npm package
