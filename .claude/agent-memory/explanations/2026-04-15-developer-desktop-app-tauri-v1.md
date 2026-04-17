---
agent: developer
feature: desktop-app-tauri-v1
tags: [tauri, desktop, sidecar, sea, titlebar, rust]
date: 2026-04-15
---

## What was implemented

Wrapped the specrails-hub Express+React stack as a Tauri 2.0 native desktop app across 5 groups (34 tasks). Tasks 6.1–6.5 are manual validation steps skipped per instructions.

## Group 1: Tauri Scaffold

Files created:
- `/Users/javi/repos/specrails-hub/src-tauri/tauri.conf.json` — Tauri 2.0 config with `app.windows[0]` format (NOT `tauri.windows[0]`), frameless window (`decorations: false`), size 1280×820, min 900×600, `devUrl: http://localhost:4201`, `frontendDist: ../client/dist`, sidecar registered under `bundle.externalBin`
- `/Users/javi/repos/specrails-hub/src-tauri/Cargo.toml` — Tauri 2.0 deps: `tauri@2`, `tauri-plugin-shell@2`, `tauri-plugin-dialog@2`, `reqwest` (blocking feature for health check), `serde`/`serde_json`
- `/Users/javi/repos/specrails-hub/src-tauri/build.rs` — minimal `tauri_build::build()` call
- `/Users/javi/repos/specrails-hub/src-tauri/src/lib.rs` — core app logic: port check, sidecar spawn, health check, graceful shutdown
- `/Users/javi/repos/specrails-hub/src-tauri/src/main.rs` — thin entry point calling `specrails_hub_lib::run()`
- `/Users/javi/repos/specrails-hub/src-tauri/capabilities/default.json` — Tauri 2.0 capability format with `core:default`, `shell:allow-spawn`, `shell:allow-execute`, `dialog:allow-message`, `dialog:allow-confirm`
- `/Users/javi/repos/specrails-hub/src-tauri/.gitignore` — ignores `target/`

## Group 2: App Icons

Files created:
- `/Users/javi/repos/specrails-hub/src-tauri/icons/icon.svg` — SR lettermark, `#6272a4` bg (Dracula Comment), `#f8f8f2` text (Dracula Foreground), 100px rounded corners, 512×512 viewBox
- `/Users/javi/repos/specrails-hub/src-tauri/icons/32x32.png` — placeholder (valid PNG, Dracula purple)
- `/Users/javi/repos/specrails-hub/src-tauri/icons/128x128.png` — placeholder
- `/Users/javi/repos/specrails-hub/src-tauri/icons/128x128@2x.png` — placeholder (256×256)
- `/Users/javi/repos/specrails-hub/src-tauri/icons/icon.png` — placeholder (512×512)
- `/Users/javi/repos/specrails-hub/src-tauri/icons/icon.icns` — minimal valid ICNS (macOS)
- `/Users/javi/repos/specrails-hub/src-tauri/icons/icon.ico` — minimal valid ICO (Windows)
- `/Users/javi/repos/specrails-hub/scripts/generate-icons.mjs` — runs `npx tauri icon src-tauri/icons/icon.svg` to regenerate real icons from SVG

Run `npm run generate-icons` once to produce real icons from the SVG source.

## Group 3: Rust Lifecycle (in lib.rs)

- `check_port_available(4200)` — tries TcpBind; shows dialog + exits if port busy
- Sidecar spawn via `app.shell().sidecar("specrails-server").args(["--parent-pid", &pid])`. Uses `tauri_plugin_shell::ShellExt` (Tauri 2.0 API — NOT `tauri::api::process::Command` which was Tauri 1.x)
- Health check: polls `GET http://localhost:4200/api/hub/state` every 500ms, 30s timeout; shows dialog + exits on timeout. After ready, navigates main window to `http://localhost:4200` via `window.eval`
- Graceful shutdown on `WindowEvent::CloseRequested`: SIGTERM → 5s wait → SIGKILL (Unix); HTTP POST `/shutdown` → taskkill (Windows)

## Group 4: Node.js SEA Build

Files created:
- `/Users/javi/repos/specrails-hub/scripts/build-sidecar.mjs` — 5-step build: (1) esbuild bundle server/index.ts → CJS, external: better-sqlite3; (2) write sea.json; (3) generate SEA blob via `node --experimental-sea-config`; (4) copy node binary + inject blob via postject + macOS codesign; (5) copy better-sqlite3 .node prebuilt alongside binary

Modified:
- `/Users/javi/repos/specrails-hub/server/index.ts` — added `--parent-pid=<pid>` watchdog: polls `process.kill(parentPid, 0)` every 3s, exits if parent gone
- `/Users/javi/repos/specrails-hub/package.json` — added scripts: `build:sidecar`, `build:desktop`, `dev:desktop`, `generate-icons`; added devDeps: `@tauri-apps/cli@^2.0.0`, `esbuild@^0.25.0`

## Group 5: TitleBar

Files created:
- `/Users/javi/repos/specrails-hub/client/src/components/TitleBar.tsx` — renders null when `!('__TAURI_INTERNALS__' in window)`; drag region via `data-tauri-drag-region`; SR inline SVG; window controls call `getCurrentWindow()` from `@tauri-apps/api/window`; hover states managed via `useState`; `WebkitAppRegion: 'no-drag'` on buttons prevents buttons from activating drag

Modified:
- `/Users/javi/repos/specrails-hub/client/src/App.tsx` — wraps entire render in flex-column div: `<TitleBar />` at top, content area with `flex: 1 overflow: hidden` below. Content area provides natural padding since TitleBar has `height: 38, flexShrink: 0`
- `/Users/javi/repos/specrails-hub/client/package.json` — added `@tauri-apps/api@^2.0.0` to dependencies

## Key Tauri 2.0 vs 1.x differences applied

- Config: `app.windows[0]` not `tauri.windows[0]`
- Shell plugin: `app.shell().sidecar()` not `tauri::api::process::Command`
- Capabilities file in `src-tauri/capabilities/` (new in 2.0)
- Plugin init: `.plugin(tauri_plugin_shell::init()).plugin(tauri_plugin_dialog::init())`
- Schema: `"$schema": "https://schema.tauri.app/config/2"`

## Verification results

- `npm run typecheck` — PASS (both server and client)
- `cd client && npm run build` — PASS (3230 modules, 412ms)
- `npm test` — 2 pre-existing failures in `cli/specrails-hub.test.ts` (confirmed pre-existing on main branch before this change); all other 1112 tests pass
