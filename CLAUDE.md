# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

specrails-hub is a local dashboard and CLI for managing multiple [specrails-core](https://github.com/fjpulidop/specrails-core) projects from a single interface. It visualizes AI pipeline phases (Architect → Developer → Reviewer → Ship), streams Claude CLI logs in real-time, and provides job queues, analytics, and chat per project.

## Commands

```bash
npm run dev              # Start server (4200) + client (4201) concurrently
npm run dev:server       # Server only with tsx watch
npm run dev:client       # Vite dev client only
npm run build            # Production build: client (tsc + vite) then CLI (tsc)
npm run typecheck        # TypeScript check both server and client
npm test                 # Run vitest (server + CLI tests)
npm run test:watch       # Vitest in watch mode
```

Tests use vitest with `:memory:` SQLite databases. Run a single test file:
```bash
npx vitest run server/db.test.ts
```

## Architecture

### Three-layer monorepo

```
server/     → Express + WebSocket + SQLite (TypeScript, CommonJS)
client/     → React + Vite + Tailwind v4 (TypeScript, ESM)
cli/        → specrails-hub CLI bridge (TypeScript, CommonJS)
```

Server and CLI compile to CommonJS (`tsconfig.json`). Client is ESM with its own `client/tsconfig.json`. Two separate `npm install` are needed (root + `client/`).

### Hub mode (default)

The server runs in **hub mode** by default — one Express process manages multiple projects. Use `--legacy` flag for single-project mode.

**Data layout:**
```
~/.specrails/
  hub.sqlite              # project registry
  manager.pid             # server PID
  projects/<slug>/jobs.sqlite   # per-project DB
```

**Key server modules:**
- `hub-db.ts` — hub-level SQLite (project registry CRUD)
- `project-registry.ts` — `ProjectRegistry` class: loads per-project `ProjectContext` (DB, QueueManager, ChatManager, SetupManager) at startup
- `hub-router.ts` — `/api/hub/*` routes (projects CRUD, resolve by path, settings)
- `project-router.ts` — `/api/projects/:projectId/*` routes (all per-project operations)
- `index.ts` — entry point, mode detection, mounts both routers

**Per-project isolation:** Each `ProjectContext` gets its own SQLite, QueueManager, ChatManager. The `boundBroadcast` closure injects `projectId` into all WebSocket messages — no constructor changes needed on managers.

### Client architecture

- `App.tsx` detects hub mode via `GET /api/hub/state`, renders `HubApp` or legacy `RootLayout`
- `useHub.tsx` — `HubProvider` context: project list, active project, setup wizard state
- `getApiBase()` (`lib/api.ts`) — module-level store returns `/api/projects/<id>` in hub mode, `/api` in legacy. Updated by `HubProvider` on project switch.
- `useProjectCache.ts` — stale-while-revalidate cache per project to eliminate flicker on tab switch
- `useProjectRouteMemory` (in `App.tsx`) — saves/restores URL route per project

**Per-project tab switch pattern:** All pages and hooks use `activeProjectId` as a `useEffect` dependency. On switch: cached data shown instantly, fresh data fetched in background. Never reset to empty state.

### WebSocket protocol

Single WS connection broadcasts all messages. Every project-scoped message includes `projectId`. Client-side handlers filter by `activeProjectId`. Hub-level messages (`hub.project_added`, `hub.project_removed`, `hub.projects`) have no `projectId` and reach all handlers.

### Process spawning

`QueueManager` and `ChatManager` spawn `claude` CLI processes. Both accept a `cwd` parameter (set to `project.path` from `ProjectRegistry`) so Claude runs in the correct project directory.

### Setup wizard

When adding a project without specrails, a 5-phase wizard runs:
1. Path input (AddProjectDialog)
2. Installation proposal
3. `npx specrails-core` execution with streaming log
4. Split-view: CheckpointTracker (left) + SetupChat with Claude `/setup` (right)
5. Completion summary

Managed by `SetupManager` (server) and `SetupWizard` component (client). Hub context tracks which projects are in setup via `setupProjectIds`.

**Install tiers.** The wizard offers two tiers via `TierSelector`:

- **Quick Setup** — template agents, ready in seconds. Always available.
- **Full Setup** — AI-enriched flow (codebase analysis + persona generation). **Currently disabled in the hub UI** (rendered greyed-out with a "Coming soon" badge). The feature is 100% operational in [specrails-core](https://github.com/fjpulidop/specrails-core) via `npx specrails-core@latest init` — we're working on re-integrating it into the hub. SetupWizard tests that exercise the full-tier flow are marked `it.skip('[full-tier gated] …')` / `describe.skip('[full-tier gated] Complete step', …)` — unskip them when the feature ships.

### Terminal panel

Per-project bottom terminal panel (VSCode/Cursor style) gated by `FEATURE_TERMINAL_PANEL` (set `VITE_FEATURE_TERMINAL_PANEL=true` to enable in the client). Server gate: `SPECRAILS_TERMINAL_PANEL !== 'false'` (default on).

**Server (`server/terminal-manager.ts`)**: singleton `TerminalManager` owns all PTY sessions via `node-pty`. Each session keeps a 256 KB ring buffer of raw output, a set of attached WebSocket clients, and a stored `projectId`. Shells are spawned with `$SHELL -l -i` on POSIX (so `.zshrc` / `.bashrc` load) or `powershell.exe -NoLogo` on Windows, with `TERM=xterm-256color` + `COLORTERM=truecolor` and `cwd = project.path`. Hard cap of 10 sessions per project. REST endpoints under `/api/projects/:projectId/terminals` (GET list, POST create, PATCH rename, DELETE kill). PTY streaming uses a dedicated WebSocket `/ws/terminal/:id?token=...&projectId=...` — NOT the shared `/ws` — so terminal throughput cannot starve the project event stream. Attach protocol: `<scrollback binary>` → `{type:"ready",cols,rows}` JSON → live binary frames. Project removal via `ProjectRegistry.removeProject` calls `killAllForProject(id)`; graceful shutdown (SIGTERM/SIGINT) runs `terminalManager.shutdown()` (SIGTERM, 2s grace, SIGKILL).

**Client (`client/src/context/TerminalsContext.tsx`)**: per-project state (`visibility: hidden|restored|maximized`, `userHeight`, `sessions`, `activeId`) lives in a single provider mounted above the route outlet so it survives project switches. Key invariant: xterm.js `Terminal` instances are created once per session and NEVER unmounted until kill — each session's container div is attached to a hidden `<div id="specrails-terminal-host">` appended to `document.body`. The `TerminalViewport` component `appendChild`s the active session's container into its own subtree on mount and moves it back on unmount (survives StrictMode double-invoke). Panel visibility + `userHeight` persisted per-project to `localStorage` under `specrails-hub:terminal-panel:<projectId>`. `Cmd+J` / `Ctrl+J` toggles the panel (guarded against `[role="dialog"]`) and focuses the active xterm on open. Minimize (panel chevron + StatusBar chevron at pixel-identical offset, both using `PanelChevronButton`) does NOT kill PTYs; close (trash icon + per-terminal `✕`) kills directly with no confirmation.

**Desktop packaging (`scripts/build-sidecar.mjs`)**: `node-pty` is marked external in esbuild, and its full package directory is copied to `src-tauri/binaries/node-pty/` (so `spawn-helper` resolves on real filesystem instead of inside the pkg snapshot). The prebuilt `pty.node` is also copied to `src-tauri/binaries/pty.node` as a `dlopen` target. The `Module._resolveFilename` / `_load` and `process.dlopen` patches at the top of `server/index.ts` redirect `require('node-pty')` to a `createRequire`-based loader anchored at the externally extracted path. `APPLE_SIGNING_IDENTITY` triggers codesigning of `pty.node` + `spawn-helper` (hardened runtime + entitlements for the helper) for notarization.

## Conventions

- **File naming**: kebab-case for server/CLI, PascalCase for React components
- **State per project**: never use module-level caches that bleed between projects. Use `useProjectCache` or per-project Maps in refs.
- **API calls**: always use `getApiBase()` prefix, never hardcode `/api/...`
- **WS handlers**: always filter `msg.projectId` against active project via ref (not stale closure)
- **Settings**: hub settings = modal (`GlobalSettingsPage`), project settings = route (`SettingsPage`)
- **Chat**: sidebar panel in `ProjectLayout`, not a separate page

## Ports

- `4200` — Express server (API + WebSocket)
- `4201` — Vite dev server (proxies `/api` and `/hooks` to 4200)

## Release pipeline

Releases are automated via release-please + GitHub Actions:

- **CI** (`.github/workflows/ci.yml`) — runs `typecheck` + `vitest` + coverage enforcement on every push and PR. Coverage thresholds are hard gates: **70% global** (lines/functions/statements) and **80% server** (lines/functions/statements, 70% branches). CI fails if thresholds are not met.
- **Release** (`.github/workflows/release.yml`) — on every push to `main`:
  - release-please creates/updates a Release PR (bumps version in `package.json` + `CHANGELOG.md`)
  - When the Release PR is merged, release-please creates the GitHub Release and `npm publish` runs automatically
  - Publishes with **npm provenance attestation** (`--provenance --access public`) for SLSA Level 2 supply chain security. Requires `id-token: write` permission in the workflow.
- **Desktop Release** (`.github/workflows/desktop-release.yml`) — on every `v*` tag push or manual dispatch:
  - Builds a signed + notarised macOS Apple Silicon `.dmg` via Tauri.
  - FTP-uploads the `.dmg` to Hostinger under two paths: the archival versioned folder `downloads/specrails-hub/v<version>/` and a stable `downloads/specrails-hub/latest/` channel.
  - Writes a machine-readable `manifest.json` into `latest/` describing the release (schemaVersion, version, releasedAt, releaseUrl, platforms.darwin-arm64 with filename/url/sha256/size). Consumers like specrails-web read this to render a Download CTA without hardcoding versions.
  - Ordering: `.dmg` is uploaded first and HEAD-verified before `manifest.json` is uploaded, so a consumer that sees the new manifest always finds the referenced binary.
  - **Server-side one-time setup**: the Hostinger `latest/` folder contains a hand-authored `.htaccess` that sets `Cache-Control: no-cache, must-revalidate` and `Access-Control-Allow-Origin: *` on `manifest.json`. This file is server-managed, not in the repo — do not add workflow steps that wipe `latest/` wholesale. See the inline comment in `desktop-release.yml` for the `.htaccess` contents.

Commit message prefixes that affect versioning: `feat:` → minor, `fix:` → patch, `feat!:` → major. Commits without a conventional prefix are ignored by release-please.
