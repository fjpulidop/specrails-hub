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

### Hub mode

The server runs in **hub mode** — one Express process manages multiple projects. Hub is the only supported mode.

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

- `App.tsx` mounts `HubProvider` and `HubApp` unconditionally
- `useHub.tsx` — `HubProvider` context: project list, active project, setup wizard state
- `getApiBase()` (`lib/api.ts`) — module-level store returns `/api/projects/<id>` for the active project; throws when no project is set. Updated by `HubProvider` on project switch.
- `useProjectCache.ts` — stale-while-revalidate cache per project to eliminate flicker on tab switch
- `useProjectRouteMemory` (in `App.tsx`) — saves/restores URL route per project

**Per-project tab switch pattern:** All pages and hooks use `activeProjectId` as a `useEffect` dependency. On switch: cached data shown instantly, fresh data fetched in background. Never reset to empty state.

**Job Detail page surfaces.** The Job Detail page (`client/src/pages/JobDetailPage.tsx`) renders two purpose-built components: `JobStatusPanel` (`client/src/components/JobStatusPanel.tsx`, formerly `JobCompletionSummary`) which renders for `running`, `completed`, and `failed` jobs with a header label/icon mapped to status, a 1-second ticker for live Duration, an incremental `useReducer`-based aggregator that derives Turns and Tokens from streamed `assistant` events (tolerant of missing `usage` fields), and Cost shown as `—` until the authoritative `total_cost_usd` arrives at job exit. `JobTicketHeader` (`client/src/components/JobTicketHeader.tsx`) renders a premium ticket-identity card above the existing job info row whenever the server resolves at least one ticket from the job's `command` (the `tickets[]` field on `GET /jobs/:id`); list mode at 2–3 tickets, compact `+ N more` mode with expand chevron at ≥4. Clicking a chip routes through `TicketDetailModalProvider` (`client/src/context/TicketDetailModalContext.tsx`) — a thin context mounted at the App root that opens the existing `TicketDetailModal` over the page without changing the route.

**Minimizable chat windows.** `MinimizedChatsProvider` (`client/src/context/MinimizedChatsContext.tsx`) lives at App root inside `HubProvider` and manages a global stack of parked chat sessions. Each chat is surfaced as a long-lived **sonner toast** (`toast.custom(..., { id: chatId, duration: Infinity })`) so chips stack alongside the project's existing Quick-mode spec-generation toasts (same glass-card chrome, no separate dock). Two surfaces opt in today: `ExploreSpecShell` (Add Spec → Explore) and `AiRefineOverlay` (Agents → AI Edit). Triggers (`SpecsBoard`, `AgentsCatalogTab`) own the shell's local state and call `provider.minimize({ kind, projectId, label, restoreRoute, params })` from the shell's minimize button — the provider fires the toast and tracks it via `toastedRef`. Restore = chip click → `toast.dismiss(id)` → `setActiveProjectId` → `navigate(restoreRoute)` → trigger consumes a pending-restore via `usePendingRestore(kind, projectId, cb)` → re-mounts the shell with `resumeConversationId` (explore-spec) or `resumeRefineId` (ai-edit) so the server-side session rehydrates. Persistence is metadata-only in `localStorage['specrails-hub:minimized-chats']`, capped at 50 entries; entries for deleted projects are dropped silently and chips are also dismissed during the setup-wizard takeover. Minimize never triggers discard-confirm — Esc / close keep their existing destructive-confirm rules.

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

**Developer prerequisites gate.** `AddProjectDialog` and `SetupWizard` both render `<PrerequisitesPanel />` driven by the shared `usePrerequisites()` hook (60s in-memory cache, recheck on `window.focus`, manual recheck via the install-instructions modal). The hook fetches `GET /api/hub/setup-prerequisites` (server enriches the response with `platform`, `minVersion`, `meetsMinimum`, and `executable` per tool). `AddProjectDialog` disables its submit while any required tool is missing, surfaces a "More info" link only when the panel is in the missing state, and opens `<InstallInstructionsModal />` with OS-aware install commands (Homebrew on macOS, winget on Windows, apt/dnf on Linux) plus copy-to-clipboard. `SetupManager.startInstall` keeps `formatMissingSetupPrerequisites()` as a server-side defence-in-depth before spawning `npx specrails-core`.

**GUI-launch PATH resolution (`server/path-resolver.ts`).** When the desktop app is launched from Finder/Dock, the embedded server inherits the launchd `PATH` which on Apple Silicon does not include `/opt/homebrew/bin`, breaking `which node` against brew installs. At startup the server runs `resolveStartupPath()` (sync) to prepend missing well-known package-manager directories (`/opt/homebrew/{bin,sbin}`, `/usr/local/{bin,sbin}` on macOS; `/usr/local/{bin,sbin}`, `~/.local/bin` on Linux; no-op on Windows). Right after `app.listen` it kicks off `augmentPathFromLoginShell()` (async, 1500ms timeout) to merge any additional segments from the user's `$SHELL -l -i` rc files (Volta/nvm/fnm/asdf shims). The resolved `PATH` is written to `process.env.PATH`, so all downstream spawns (`QueueManager`, `ChatManager`, `SetupManager`, `terminalManager`) inherit it without per-callsite changes. The setup-prerequisites response distinguishes `installed` (on PATH) from `executable` (`<cmd> --version` exited 0), surfacing a broken-symlink hint when `installed && !executable`. `GET /api/hub/setup-prerequisites?diagnostic=1` returns the resolved PATH, per-segment source (`'inherited' | 'fast-path' | 'login-shell'`), login-shell status, and per-tool `which` results, used by the "Copy diagnostics" button in the install-instructions modal.

**Install tiers.** The wizard offers two tiers via `TierSelector`:

- **Quick Setup** — template agents, ready in seconds. Always available.
- **Full Setup** — AI-enriched flow (codebase analysis + persona generation). **Currently disabled in the hub UI** (rendered greyed-out with a "Coming soon" badge). The feature is 100% operational in [specrails-core](https://github.com/fjpulidop/specrails-core) via `npx specrails-core@latest init` — we're working on re-integrating it into the hub. SetupWizard tests that exercise the full-tier flow are marked `it.skip('[full-tier gated] …')` / `describe.skip('[full-tier gated] Complete step', …)` — unskip them when the feature ships.

### Agent profiles (Agents section)

Per-project catalog of agent profiles — declarative JSON that tells the implement pipeline which agents to run, which models to use per agent, and how to route tasks. Profiles are selected per rail at launch time (snapshot-per-job) so concurrent rails in the same batch can run distinct profiles. Requires `specrails-core >= 4.1.0` in the project; otherwise the hub gracefully falls back to legacy behavior (no env injection).

**Server (`server/profile-manager.ts`)**: CRUD over `<project>/.specrails/profiles/*.json` with `ajv` v1 schema validation (`server/schemas/profile.v1.json`, a copy of the specrails-core schema). Structural checks beyond JSON Schema: exactly one terminal `default: true` routing rule and it must be last; baseline trio (`sr-architect`, `sr-developer`, `sr-reviewer`) must be present in `agents[]`. Resolution order at launch: explicit selection → `.user-preferred.json` (gitignored) → `default` profile. `snapshotForJob` writes the resolved profile to `~/.specrails/projects/<slug>/jobs/<jobId>/profile.json` (chmod 400) before spawn. `persistJobProfile` inserts into `job_profiles` for analytics.

**REST surface (`server/profiles-router.ts`)** mounted at `/api/projects/:projectId/profiles`, gated by `SPECRAILS_AGENTS_SECTION !== 'false'`: list/get/create/update/delete/duplicate/rename profiles; `/active` for the per-developer preference; `/resolve?profile=…` to preview resolution; `/catalog` and `/catalog/:agentId` for the agents catalog viewer; `/core-version` for the upgrade banner; `/analytics?windowDays=30` for per-profile metrics; `/migrate-from-settings` to seed `default.json` from existing frontmatter models.

**QueueManager integration (`server/queue-manager.ts`)**: `EnqueueOptions` accepts `profileName` (string = explicit, null = force legacy, undefined = default resolution). At spawn time `projectSupportsProfiles(cwd)` checks `.specrails/specrails-version` (gate: `>= 4.1.0`); when allowed, profile resolved + snapshotted + persisted + env var `SPECRAILS_PROFILE_PATH` injected. OTEL resource attrs include `specrails.profile_name` and `specrails.profile_schema_version` when profile mode is active.

**Client (`client/src/pages/AgentsPage.tsx`)**: `/agents` route under ProjectLayout, reached from the right sidebar. Two tabs: **Profiles** (full CRUD + agent chain editor with catalog picker + routing rules editor + per-profile analytics card) and **Agents Catalog** (read-only viewer of upstream and custom agents). Yellow banner at the top when the project's core version is below 4.1.0. Launch dialogs (`ImplementWizard`, `BatchImplementWizard`) include a `ProfilePicker` that preselects the resolved default and sends `profileName` in the `/spawn` payload.

**Reserved paths (contract with specrails-core)**: `.specrails/profiles/**` and `.claude/agents/custom-*.md` are never touched by specrails-core's `init` / `update` commands (Node-native from v4.2.0, bash `install.sh`/`update.sh` before). Profiles are committable team assets; `.user-preferred.json` inside `.specrails/profiles/` is auto-gitignored on first write.

### Terminal panel

Per-project bottom terminal panel (VSCode/Cursor style) gated by `FEATURE_TERMINAL_PANEL` (set `VITE_FEATURE_TERMINAL_PANEL=true` to enable in the client). Server gate: `SPECRAILS_TERMINAL_PANEL !== 'false'` (default on).

**Server (`server/terminal-manager.ts`)**: singleton `TerminalManager` owns all PTY sessions via `node-pty`. Each session keeps a 256 KB ring buffer of raw output, a set of attached WebSocket clients, and a stored `projectId`. Shells are spawned with `$SHELL -l -i` on POSIX (so `.zshrc` / `.bashrc` load) or `powershell.exe -NoLogo` on Windows, with `TERM=xterm-256color` + `COLORTERM=truecolor` and `cwd = project.path`. Hard cap of 10 sessions per project. REST endpoints under `/api/projects/:projectId/terminals` (GET list, POST create, PATCH rename, DELETE kill). PTY streaming uses a dedicated WebSocket `/ws/terminal/:id?token=...&projectId=...` — NOT the shared `/ws` — so terminal throughput cannot starve the project event stream. Attach protocol: `<scrollback binary>` → `{type:"ready",cols,rows}` JSON → live binary frames. Project removal via `ProjectRegistry.removeProject` calls `killAllForProject(id)`; graceful shutdown (SIGTERM/SIGINT) runs `terminalManager.shutdown()` (SIGTERM, 2s grace, SIGKILL).

**Client (`client/src/context/TerminalsContext.tsx`)**: per-project state (`visibility: hidden|restored|maximized`, `userHeight`, `sessions`, `activeId`) lives in a single provider mounted above the route outlet so it survives project switches. Key invariant: xterm.js `Terminal` instances are created once per session and NEVER unmounted until kill — each session's container div is attached to a hidden `<div id="specrails-terminal-host">` appended to `document.body`. The `TerminalViewport` component `appendChild`s the active session's container into its own subtree on mount and moves it back on unmount (survives StrictMode double-invoke). Panel visibility + `userHeight` persisted per-project to `localStorage` under `specrails-hub:terminal-panel:<projectId>`. `Cmd+J` / `Ctrl+J` toggles the panel (guarded against `[role="dialog"]`) and focuses the active xterm on open. Minimize (panel chevron + StatusBar chevron at pixel-identical offset, both using `PanelChevronButton`) does NOT kill PTYs; close (trash icon + per-terminal `✕`) kills directly with no confirmation.

**Desktop packaging (`scripts/build-sidecar.mjs`)**: `node-pty` is marked external in esbuild, and its full package directory is copied to `src-tauri/binaries/node-pty/` (so `spawn-helper` resolves on real filesystem instead of inside the pkg snapshot). The prebuilt `pty.node` is also copied to `src-tauri/binaries/pty.node` as a `dlopen` target. The `Module._resolveFilename` / `_load` and `process.dlopen` patches at the top of `server/index.ts` redirect `require('node-pty')` to a `createRequire`-based loader anchored at the externally extracted path. The shell-integration shims (`server/shell-integration/{zsh,bash,fish,powershell}-shim.*`) are also copied to `src-tauri/binaries/shell-integration/` so the runtime resolver in `server/terminal-shell-integration.ts` can locate them via `path.resolve(process.execPath, '..', 'shell-integration', name)`. `APPLE_SIGNING_IDENTITY` triggers codesigning of `pty.node` + `spawn-helper` (hardened runtime + entitlements for the helper) for notarization.

**Premium-panel features (post `add-premium-terminal-panel`)**: the panel layers WebGL rendering (with canvas fallback on context loss), Unicode 11 widths, ligatures, scrollback search (Cmd+F), font zoom (Cmd+= / -/0), Cmd+C/V/K clipboard keybindings, right-click context menu, drag-drop file path injection (Tauri only, POSIX/Windows shell-quoted), trailing-debounced resize + sidebar transitionend hook for jitter-free animation, and a shell-integration layer based on OSC 133 / OSC 1337 marks. The `TerminalManager` injects per-shell shims (`ZDOTDIR` for zsh, `--rcfile` for bash, `XDG_CONFIG_HOME` for fish, `-NoLogo -NoExit -File` for PowerShell) chmod-600 under `~/.specrails/projects/<slug>/terminals/<sessionId>/`, parses inbound OSC streams server-side via `OscParser`, broadcasts JSON `{type:"mark",kind,...}` control frames on the existing `/ws/terminal/:id` socket, persists completed commands to `terminal_command_marks` (FIFO-capped at 1000 per session), and cleans up shim dirs on session kill plus a 24h-stale sweep at startup. Settings live in `hub_settings` (key/value, hub-wide) and `terminal_settings_override` per-project; resolution order is project override → hub default → built-in. REST: `GET/PATCH /api/hub/terminal-settings`, `GET/PATCH /api/projects/:projectId/terminal-settings`, `GET /api/projects/:projectId/terminals/:id/marks`. Inline images via `@xterm/addon-image` (Sixel + iTerm2 protocol) and long-running command notifications via the Tauri notification plugin (with browser HTML5 `Notification` fallback) round out the differentiator surface. Disabled-by-default behaviours degrade silently when integrations fail (sentinel-not-seen toast informs the user).

## Coverage policy (MANDATORY)

CI enforces coverage thresholds: **70% global** (lines/functions/statements) and **80% server** (lines/functions/statements, 70% branches), plus **80% client** (lines/statements, 70% functions). If the local run fails any of these thresholds, you MUST iterate — write more tests — until every threshold passes locally before pushing or asking the user. Never lower the thresholds. Never propose lowering as a fix. The exact commands to mirror CI:

```bash
npm run typecheck
npm test
npm run test:coverage              # server, must pass 80% lines/functions/statements
cd client && npm run test:coverage # client, must pass 80% lines/statements
```

Excluding files from coverage is allowed only when the file is structurally unreachable in the test environment (e.g. Tauri-only paths in jsdom) — never to mask missing tests. If you exclude, document the reason inline in `client/vitest.config.ts` / `vitest.config.ts` next to the entry.

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
  - Runs two build jobs in parallel:
    - `build-macos` on `macos-latest`: signed + notarised Apple Silicon `.dmg`.
    - `build-windows` on `windows-latest`: **unsigned** NSIS `.exe` installer and MSI. v1 ships without Authenticode signing on purpose — users see a SmartScreen warning and must click "More info → Run anyway". Code signing is a separate follow-up change. See `docs/windows.md`.
  - Canonical installer filenames, enforced by a rename step in `deploy`:
    - `specrails-hub-<version>-aarch64.dmg`
    - `specrails-hub-<version>-x64-setup.exe` (NSIS)
    - `specrails-hub-<version>-x64.msi`
  - FTP-uploads every installer to Hostinger under two paths: the archival versioned folder `downloads/specrails-hub/v<version>/` and the stable `downloads/specrails-hub/latest/` channel.
  - Writes a machine-readable `manifest.json` into `latest/` describing the release (schemaVersion, version, releasedAt, releaseUrl, `platforms.darwin-arm64` and `platforms.windows-x64`, each with filename/url/sha256/size). The `windows-x64` entry points at the NSIS `.exe`; the MSI is reachable via the versioned folder but is NOT referenced by manifest. Consumers like specrails-web read this to render Download CTAs without hardcoding versions.
  - Ordering: every installer referenced by the manifest (`.dmg`, `.exe`) is uploaded AND HEAD-verified before `manifest.json` is uploaded. A consumer that sees the new manifest must always find the referenced binary, for every platform.
  - **Server-side one-time setup**: the Hostinger `latest/` folder contains a hand-authored `.htaccess` that sets `Cache-Control: no-cache, must-revalidate` and `Access-Control-Allow-Origin: *` on `manifest.json`. This file is server-managed, not in the repo — do not add workflow steps that wipe `latest/` wholesale. The `Delete stale installers in latest/` step only removes `.dmg|.exe|.msi` files. See the inline comment in `desktop-release.yml` for the `.htaccess` contents.

Commit message prefixes that affect versioning: `feat:` → minor, `fix:` → patch, `feat!:` → major. Commits without a conventional prefix are ignored by release-please.

### Plugin system (Integrations)

Per-project marketplace of MCP-based integrations. Each project independently decides which plugins to install. v1 ships **bundled-only**: every plugin available is compiled into the hub binary; there is no remote registry, no user-installable plugins, and no third-party loading. **Zero changes are required in `specrails-core`** — plugins only contribute MCP server entries (via `.mcp.json`) and optionally a fragment in the already-protected `.claude/agents/custom-*.md` namespace.

**Additivity is the central invariant.** Adding plugin N+1 must never mutate any artifact owned by plugin N or by the user. Each plugin's manifest declares `owns.mcpServers` / `owns.agentFragments`; ownership conflicts are detected at hub startup (`buildOwnershipMap`) and fail fast. All file mutations (`.mcp.json`, `state.json`) are surgical (read → modify only owned keys → atomic temp+rename) and serialised by an in-process file mutex.

**Server (`server/plugin-manager.ts` + `server/plugins/`)**: `PluginManager` owns the lifecycle: `listAvailable`, `previewInstall`, `install` (with rollback on verify failure), `uninstall`, `verify` (timeout-bounded, default 2000ms), `removeOrphan`. State lives at `<project>/.specrails/plugins/state.json` (`{ schemaVersion: 1, plugins: { [name]: { version, installedAt, installedFiles, health, healthReason } } }`). `BUNDLED_PLUGINS` is a typed array in `server/plugins/index.ts` — registering a new plugin requires only appending an import. Helpers `PluginManager.mergeMcpServers` / `removeMcpServers` are the only sanctioned way to mutate `.mcp.json`.

**REST (`server/plugins-router.ts`)** mounted at `/api/projects/:projectId/plugins`, gated by `SPECRAILS_PLUGINS_SECTION !== 'false'`: `GET /` (catalog with status `installed | not-installed | orphan | degraded`), `GET /:name/preview-install` (diff before mutation), `POST /:name/install` (with WS streaming progress via `plugin.install_progress`), `DELETE /:name` (uninstall or orphan removal), `GET /:name/health` (on-demand verify).

**WS events**: `plugin.installed`, `plugin.uninstalled`, `plugin.health_changed`, `plugin.degraded`, `plugin.install_progress` — all `projectId`-scoped.

**Rail integration (`server/queue-manager.ts` + `server/plugins/rail-integration.ts`)**: before spawning a `claude` rail process, `QueueManager` resolves installed plugins (parallel verify with per-plugin timeout), classifies into `active` and `degraded`, and writes a per-job snapshot to `~/.specrails/projects/<slug>/jobs/<jobId>/plugins.json` (chmod 400). It injects env vars `SPECRAILS_PLUGINS_ACTIVE` (CSV) and `SPECRAILS_PLUGINS_SNAPSHOT` (path). When pipeline telemetry is enabled, OTEL resource attrs include `specrails.plugins.active`, `specrails.plugins.degraded`, and `specrails.plugins.versions`. **Healthcheck failure is non-blocking** — degraded plugins emit `plugin.degraded` but the rail spawns normally. `ChatManager` inherits MCP config via `cwd` (no snapshot, no env injection); `SetupManager` ignores plugins entirely (project under construction).

**Diagnostic export (`server/telemetry-export.ts`)**: includes `plugins.json` in the ZIP and a "Plugins" section in `summary.md` whenever a per-job plugin snapshot exists.

**Bundled today**: `serena` (semantic code navigation via LSP+MCP). Manifest in `server/plugins/serena/manifest.ts`; install adds `mcpServers.serena` running `uvx --from git+https://github.com/oraios/serena ...`; verify probes `uvx serena --version`. The optional `templates/instructions.md` fragment lands at `<project>/.claude/agents/custom-serena.md`. Requires `uv` on PATH (auto-detected by an extended `setup-prerequisites.ts` with `includeUv: true`).

**Reserved paths (per-project, hub-managed)**: `<project>/.mcp.json` (surgical merge), `<project>/.specrails/plugins/state.json`, `<project>/.specrails/plugins/snapshots/<jobId>.json`, `<project>/.claude/agents/custom-<plugin>.md`. Hub never wholesale rewrites any of these.

### Theme system

Hub-wide UI theme selectable from `GlobalSettingsPage > Appearance`. Three built-ins: `dracula` (default), `aurora-light`, `obsidian-dark`. Persisted hub-wide as `hub_settings.ui_theme` (server) and mirrored to `localStorage['specrails-hub:ui-theme']` (client) with an inline anti-FOUC script in `client/index.html` that applies `data-theme` on `<html>` before React hydrates.

**Token contract**: components MUST use semantic Tailwind tokens (`accent-primary`, `accent-info`, `accent-success`, `accent-secondary`, `accent-warning`, `accent-highlight`, `surface`, `background-deep`, plus the shadcn-style `background`/`foreground`/`card`/`muted`/`destructive`). Brand-named tokens (`dracula-*`) are forbidden — a regression guard greps for them. Adding a fourth theme requires only (a) appending a descriptor to `client/src/lib/themes.ts`, (b) a new `[data-theme="<id>"] { ... }` block in `client/src/globals.css`, and (c) extending the allow-list in both `THEME_IDS` and `server/hub-router.ts`. No component-code changes.

**Non-CSS surfaces** (xterm, Recharts, syntax highlighting) read the active theme via `useActiveTheme()` (gracefully falls back to `getActiveTheme()` when no `<ThemeProvider>` is mounted, so unit tests don't need provider wrapping). xterm instances reconfigure live (`term.options.theme = ...`) without losing scrollback or shell-integration state.

**REST**: `GET /api/hub/theme` returns `{ theme }`; `PATCH /api/hub/theme` validates the body against the allow-list and returns 400 on rejection.

### Draft tickets (Save as Draft)

In-progress Explore Spec sessions can be persisted as **draft tickets** so the user can resume an exploration later from the SpecsBoard.

**Schema (`server/ticket-store.ts`)**: `TicketStatus` includes `'draft'`; `Ticket.priority` is widened to `TicketPriority | null`; `Ticket.origin_conversation_id: string | null` links the Explore conversation. The JSON store's `schema_version` bumps from `'1.0'` to `'1.1'` on first write under this code; old stores remain readable (the read path normalizes missing `origin_conversation_id` to `null`). `validatePriorityForStatus(status, priority)` is the single source of truth: priority MAY be null only when `status === 'draft'`.

**Server endpoints (`server/project-router.ts`)**:
- `POST /tickets/save-as-draft` — persists an Explore session as a draft. Body: `{ conversationId, title?, description?, labels? }`. Rejects when the conversation has no user-submitted turn. Idempotent on `conversationId`: a second save updates the existing draft instead of inserting a duplicate. Auto-title via `server/explore-draft-title.ts` when no title is provided (deterministic single-line summary; LLM enrichment is the documented extension point).
- `POST /tickets/from-draft` — extended with a flip-in-place path: when the body carries `draftTicketId` (or just `conversationId` matching an existing draft's `origin_conversation_id`), the server flips the existing row (`status: 'draft' → 'todo'`, sets `priority`, replaces title/description, preserves `origin_conversation_id`) and broadcasts `ticket_updated`. Legacy non-draft path (no draft match) still inserts a new row and broadcasts `ticket_created`.
- `DELETE /tickets/:id` — when the deleted ticket is a draft and is the only ticket referencing its `origin_conversation_id`, the linked `chat_conversations` row (kind `'explore'`) is cascade-deleted.
- `DELETE /chat/conversations/:id` — sweeps tickets whose `origin_conversation_id` matches and clears the field to `null` (application-level "ON DELETE SET NULL").

**Client surfaces**:
- `ExploreSpecShell` exposes a `Save as Draft` button (disabled until at least one user-submitted turn) and replaces the destructive close confirm with a three-way `Save as Draft / Discard / Cancel` prompt (Save is default-focused). The minimize-to-toast path is unchanged.
- `SpecCard`, `TicketListView`, `TicketGridView`, `TicketPostItView`, and `TicketStatusIndicator` render a draft visual variant: subtle `accent-secondary` background/border (semantic theme tokens, no brand-named colours) and a `Draft` pill in the priority pill's DOM slot. Drafts live in the existing Backlog column — no new column, no filter chip, no collapsible section.
- `TicketDetailModal` shows a `Continue Explore` action when `status === 'draft'` and `origin_conversation_id` is non-null. Activating it calls `MinimizedChatsContext.triggerResume(...)` to navigate + queue a pending-restore that `ExploreSpecShell` consumes via `usePendingRestore`. The ticket stays `status='draft'` during the resumed session.

**Lifecycle**: drafts are never auto-deleted. They disappear only on explicit Discard or when committed to a non-draft status. `from-draft` flip preserves `origin_conversation_id` permanently for future "View origin conversation" UI.

**Out of scope** (deferred): concurrency lock when two tabs edit the same draft (last-write-wins for now), and surfacing `origin_conversation_id` on committed tickets as a UI affordance.

### Explore Spec acceleration

The Explore Spec chat ships a multi-pronged latency optimisation so that first-token feels electric without compromising spec quality.

**Hub-managed cwd (`server/explore-cwd-manager.ts`):** Explore turns spawn `claude` from `~/.specrails/projects/<slug>/explore-cwd/` rather than the project path, so the project's `CLAUDE.md` (often huge) is not auto-loaded by the CLI. The dir contains a hub-owned embedded `CLAUDE.md` (~50 lines, focused on the Explore-Spec stance) and a `./project` symlink (junction on Windows; `project-path.txt` fallback if both fail) pointing at `<project.path>`. Tools (`Read`, `Grep`, `Glob`) keep working against the user's repo via that link. The user's `<project>/CLAUDE.md` is never modified, moved, or referenced — only the link target is.

**Per-project toggle (`config.explore_mcp_enabled`, default OFF):** Stored in the existing `queue_state` key/value table. Exposed via `GET/PATCH /api/projects/:projectId/explore-mcp-enabled`. When ON, Explore turns spawn from `<project.path>` (legacy behaviour) so `.mcp.json` MCP servers load; when OFF (default), spawn from the explore-cwd and skip MCP. UI lives in `SettingsPage` under an `Explore Spec` card.

**Byte-stable system prompt:** `ChatManager._buildLightweightSystemPrompt()` is deterministic — no timestamps, costs, or live aggregates — so Anthropic prompt cache hits on turns 2+ within the 5-minute TTL window. The non-Explore `_buildSystemPrompt()` retains its live dashboard context unchanged.

**Lifecycle (`ChatManager._exploreLifecycle`):** Per-Explore-conversation state with three policies:
- **Idle-kill on minimize:** `POST /api/projects/:projectId/chat/conversations/:id/minimize` arms a 2-minute idle timer; if no message and no restore in that window, any active spawn is `treeKill`ed (SIGTERM). The conversation row's `session_id` is preserved; the next message respawns with `--resume`. `POST .../restore` cancels the timer. The timer only arms when the conversation is not currently streaming.
- **Crash auto-respawn:** if the child exits non-zero before emitting a `result` event and the user did not interrupt, the same turn respawns once with `--resume`. The crash counter resets on any successful turn. A second crash surfaces `chat_error`.
- **Concurrency cap of 5 per project:** the sixth Explore turn evicts the oldest idle Explore spawn; if all five are streaming, the new turn queues with a 30-second timeout and then emits `chat_error reason='busy'` if no slot opens.

**Premium UX (`client/src/components/explore-spec/ExploreStatusPills.tsx`):** Status pills `Conectando… → Pensando… → Consultando código…` are rendered above the streaming assistant bubble for the first few hundred ms of every turn, gated by `VITE_FEATURE_EXPLORE_PREMIUM_UX !== 'false'` for an emergency disable. Each pill displays for at least 150 ms to avoid flicker. The pill area unmounts as soon as the first text delta arrives.

**Escape hatches:** `SPECRAILS_EXPLORE_LEGACY_CWD=1` (server env) forces every Explore spawn to use `<project.path>` and skips materialising the explore-cwd entirely. `VITE_FEATURE_EXPLORE_PREMIUM_UX=false` (client build flag) reverts the status pills to a pre-change rendering. Both keep Explore functional and lose no data.

**Cleanup:** `ProjectRegistry.removeProject` calls `removeExploreCwd(slug)` which recursively rms the explore-cwd directory (the `./project` symlink is `unlink`ed explicitly, never followed). Any active Explore spawns are independently torn down.

**Out of scope** (deferred): true persistent stdin multi-turn (`claude --input-format stream-json` keeping a single child alive across turns), char-by-char client-side rendering buffer, skeleton-on-submit assistant bubble, per-project user-customizable `<project>/.specrails/explore-instructions.md` override, sidebar-chat (`kind='sidebar'`) cache-busting fix, and Quick-mode acceleration. These remain future-change candidates.

### Project spending analytics

Per-project unified tracking of every billable AI CLI invocation (model, tokens, cost USD, turns, duration), powering the redesigned `/analytics` page (route name unchanged; right-sidebar entry still labelled "Analytics").

**Schema (`ai_invocations` table, per-project SQLite, migration 16):** `id, project_id, surface, surface_ref_id, ticket_id, conversation_id, model, status, started_at, finished_at, duration_ms, duration_api_ms, tokens_in/out/cache_read/cache_create, total_cost_usd, num_turns, session_id`. Indexed by `(project_id, started_at DESC)`, `(project_id, surface)`, partial `(project_id, ticket_id)`.

**Capture sites (in scope):** four spawners write a row at process exit via `recordInvocation` from `server/ai-invocations.ts`:
- `server/queue-manager.ts` — `surface='job'`, `surface_ref_id=<jobId>`, ticket id extracted from command.
- `server/project-router.ts` `POST /tickets/generate-spec` — `surface='quick-spec'`, ticket id set when ticket creation succeeds.
- `server/chat-manager.ts` — `surface='explore-spec'`, gated on `chat_conversations.kind === 'explore'` (sidebar chat is uninstrumented). One row per turn with `conversation_id`. `POST /tickets/from-draft` calls `updateTicketIdForConversation` to back-fill `ticket_id` on prior rows once the ticket is created.
- `server/agent-refine-manager.ts` — `surface='ai-edit'`, one row per refine turn.

**Out of scope:** chat sidebar (`kind='sidebar'`), setup wizard. Both spawn AI CLIs but never write to `ai_invocations`.

**Conversation kind (migration 17):** `chat_conversations.kind TEXT NOT NULL DEFAULT 'sidebar'`. `POST /chat/conversations` accepts an optional `{ kind: 'sidebar' | 'explore' }` field. The Explore client (`ExploreSpecShell`) sends `kind: 'explore'` via `useChat.startWithMessage(text, opts, model, 'explore')`.

**Aggregation (`server/spending.ts`):** single source of truth. `getSpending(db, projectId, filters)` returns `summary` (totals + prev-period delta), `bySurface`, `byModel` (top 10), `byMode` (Quick vs Explore), `dailyTimeline` (zero-filled, stacked by surface), `scatter` (last 500 points), `topTickets` (top 10 cross-surface, with deleted-ticket and unattributed buckets). `getInvocations` powers the raw table block and exports, with `cap` for the 10k row export limit. Aggregations exclude `failed`/`aborted` rows from cost averages but include them in `totalRuns`/`failureRate`.

**REST endpoints:**
- `GET /api/projects/:projectId/spending?period&surface&model&status&minCostUsd&ticketId` — dashboard data.
- `GET /api/projects/:projectId/invocations?...&limit&offset` — paginated raw rows.
- `GET /api/projects/:projectId/tickets/:id/spending-summary` — per-ticket aggregate used by `TicketDetailModal`.
- `GET /api/projects/:projectId/analytics/export?format=csv|json&mode=summary|raw&...` — Summary CSV is a multi-section composite (`# Totals`, `# Daily timeline`, `# By surface`, `# By model`, `# Top tickets`); Raw exports up to 10 000 rows, appending `# truncated_at=N of M` when truncated. Filename pattern: `<slug>-analytics-<period>[-<surface>]-<YYYY-MM-DD>.{csv,json}`.

**WebSocket:** `recordInvocation` callsites broadcast `spending.invalidated` (project-scoped, no payload). Open dashboards debounce 500 ms then refetch.

**Client (`client/src/pages/AnalyticsPage.tsx`):** seven blocks — sticky filter header (period + surface chips, both URL-synced), Hero burn meter (with `vs prev` delta), daily stacked timeline, Quick vs Explore card (sparse-data CTA when Explore < 5 runs), top-N model breakdown (click-to-filter), cost-vs-turns scatter, top tickets cross-surface, raw invocations table with secondary filters scoped to that block only. Surface colour mapping: `job=accent-info`, `quick-spec=accent-secondary`, `explore-spec=accent-highlight`, `ai-edit=accent-success`. Lives in `client/src/components/analytics/`.

**Ticket → Analytics deep link:** `client/src/components/TicketSpendingLine.tsx` renders a single line under the modal title (`$X · N turns · Tm Ts active · breakdown`) when the ticket has any invocations, linking to `/analytics?ticketId=<id>`.

**Export (`client/src/components/ExportDropdown.tsx`):** uses `fetch → Blob → URL.createObjectURL → anchor.click()` (works in Tauri webview; previous `window.open` path is gone). Four entries: Summary CSV/JSON, Raw CSV/JSON. Disabled when there's no data; sonner `toast.error('Export failed')` on failure. Filenames preserved from `Content-Disposition` when present.

**Tracking start:** no historical backfill. `summary.trackingStartedAt` reflects the first `started_at` in the project, surfaced in the Hero empty state ("Tracking started YYYY-MM-DD").

### Pipeline telemetry

Per-project opt-in feature that injects OpenTelemetry env vars into `claude` CLI spawns so the process emits OTLP/JSON signals to the hub.

**Default state**: OFF. Toggle lives in the project `SettingsPage`.

**Storage paths:**
- Raw blobs: `~/.specrails/projects/<slug>/telemetry/<jobId>.ndjson.gz` (concatenated gzip; one gzip member per received payload)
- Pointer rows: `telemetry_blobs` table in the per-project `jobs.sqlite`
- Aggregated summaries (post-compaction): `telemetry_summaries` table in `jobs.sqlite`

**Retention policy**: Blobs older than 7 days are compacted at server startup — raw file deleted, aggregates written to `telemetry_summaries`, pointer row set to `state="compacted"`. Blobs are never expired automatically beyond compaction.

**QueueManager-only scope**: OTEL env injection happens exclusively in `server/queue-manager.ts` at spawn time. `ChatManager` and `SetupManager` spawns are intentionally left uninstrumented (interactive sessions / wizard flows, not repeatable pipeline jobs).

**OTLP receiver**: `POST /otlp/v1/{traces,metrics,logs}` on the hub port. Routes signals by `specrails.job_id` + `specrails.project_id` from `resource.attributes`. Returns 400 if attributes missing, 404 if project/job unknown. 10 MB uncompressed cap per blob — logs are dropped once reached (traces/metrics continue), a `logs_truncated` control line is written exactly once.

**Export**: `GET /api/projects/:projectId/jobs/:jobId/diagnostic` streams a ZIP containing `job-metadata.json`, `telemetry.ndjson`, `logs.txt`, and `summary.md`. Export button on job cards visible iff a `telemetry_blobs` row exists (`active` or `compacted` state).

**specrails-core**: This feature is entirely hub-side. The `specrails-core` repository is intentionally not modified — the Claude CLI subprocess emits OTEL signals by reading env vars set by QueueManager.
