## 1. Tauri Project Scaffold

- [x] 1.1 Install Tauri CLI dev dependency: `@tauri-apps/cli` in root package.json, `@tauri-apps/api` in client/package.json
- [x] 1.2 Run `cargo init` equivalent: create `src-tauri/` with `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`
- [x] 1.3 Create `src-tauri/tauri.conf.json`: productName "SpecRails Hub", identifier `sh.specrails.hub`, frameless window (decorations: false), size 1280×820, min 900×600, devUrl `http://localhost:4201`, frontendDist `../client/dist`
- [x] 1.4 Add `src-tauri/capabilities/default.json` with window, shell, and dialog permissions
- [x] 1.5 Add `src-tauri/.gitignore` ignoring `target/`

## 2. App Icons (SR + Dracula)

- [x] 2.1 Create SVG source icon: SR lettermark, `#6272a4` background (Dracula Comment), `#f8f8f2` text (Dracula Foreground), rounded square
- [x] 2.2 Generate all required sizes: `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns` (macOS), `icons/icon.ico` (Windows), `icons/icon.png` (Linux)
- [x] 2.3 Reference icons in `tauri.conf.json` bundle icons array

## 3. Rust Main — Sidecar Lifecycle

- [x] 3.1 Implement port conflict check in `main.rs`: attempt TCP bind on 4200 before spawning; show dialog error and exit if occupied
- [x] 3.2 Implement sidecar spawn: use `tauri::api::process::Command` (or Tauri 2 sidecar API) to launch `specrails-server` with `--parent-pid {pid}` arg
- [x] 3.3 Implement health check loop: poll `GET http://localhost:4200/api/hub/state` every 500ms, timeout 30s; show error dialog and exit on timeout
- [x] 3.4 Implement graceful shutdown on window close event: SIGTERM (Unix) / HTTP POST `/shutdown` (Windows), 5s wait, SIGKILL fallback
- [x] 3.5 Add `Cargo.toml` dependencies: `tauri`, `reqwest` (blocking, for health check), `sysinfo` or manual ppid check

## 4. Node.js SEA Sidecar Build

- [x] 4.1 Add `esbuild` as dev dependency in root package.json
- [x] 4.2 Create `scripts/build-sidecar.mjs`: esbuild bundle `server/index.ts` → `build/server-bundle.js` (CommonJS, platform-native, mark `better-sqlite3` as external)
- [x] 4.3 Create `sea.json` SEA config: main `build/server-bundle.js`, output `build/specrails-server-sea.blob`
- [x] 4.4 Extend `scripts/build-sidecar.mjs`: copy Node binary, inject SEA blob via `postject`, output to `src-tauri/binaries/specrails-server-<target-triple>`
- [x] 4.5 Copy `better-sqlite3` prebuilt `.node` addon into `src-tauri/binaries/` alongside the server binary
- [x] 4.6 Add `server/index.ts` parent-PID watchdog: accept `--parent-pid` arg, poll every 3s, `process.exit()` if parent gone
- [x] 4.7 Add `"build:sidecar": "node scripts/build-sidecar.mjs"` to root package.json scripts
- [x] 4.8 Add `"build:desktop": "npm run build:server && npm run build:sidecar && tauri build"` to root package.json scripts
- [x] 4.9 Add `"dev:desktop": "tauri dev"` to root package.json scripts

## 5. Custom Titlebar Component

- [x] 5.1 Create `client/src/components/TitleBar.tsx`: renders null if `!window.__TAURI_INTERNALS__`
- [x] 5.2 Implement drag region: `data-tauri-drag-region` attribute on the main bar div
- [x] 5.3 Implement SR icon + "SpecRails Hub" label in Dracula colors (`#282a36` bg, `#f8f8f2` text)
- [x] 5.4 Implement window control buttons (minimize, maximize/restore, close) calling `@tauri-apps/api/window` APIs
- [x] 5.5 Apply hover states: close → `#ff5555`, others → `#44475a`
- [x] 5.6 Mount `<TitleBar />` at top of root layout in `client/src/App.tsx` (or equivalent root component)
- [x] 5.7 Add `padding-top` to main content area equal to titlebar height to prevent overlap

## 6. Validation

- [ ] 6.1 Run `npm run build:desktop` on macOS — confirm `.dmg` is generated in `src-tauri/target/release/bundle/dmg/`
- [ ] 6.2 Install the `.dmg`, open the app — confirm dashboard loads without terminal setup
- [ ] 6.3 Verify titlebar renders with Dracula colors and window controls work
- [ ] 6.4 Verify app exit cleanly terminates the server process (check no orphan node process)
- [ ] 6.5 Run `npm run typecheck` — confirm no TypeScript errors in client with new Tauri API imports
