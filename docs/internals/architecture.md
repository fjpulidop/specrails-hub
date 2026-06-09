# Architecture

This document describes the technical architecture of specrails-hub (v1.63.1): its layers, data layout, request flow, authentication, and the subsystems that make up the hub. It is the entry point to the other internals docs — see the [See also](#see-also) block at the bottom.

---

## Three-layer monorepo

```
specrails-hub/
├── server/       → Express 5 + WebSocket + SQLite (TypeScript, CommonJS)
├── client/       → React 19 + Vite + Tailwind v4 (TypeScript, ESM)
├── cli/          → specrails-hub CLI bridge (TypeScript, CommonJS)
└── src-tauri/    → Tauri v2 desktop shell (Rust + bundled server sidecar)
```

Server and CLI compile to **CommonJS** (root `tsconfig.json`). The client is **ESM** with its own `client/tsconfig.json`. The client has its own `package.json` and `node_modules`, so two separate `npm install` calls are required (root + `client/`).

The server persists with **better-sqlite3** (synchronous SQLite) and serves over **Express 5**; the WebSocket layer uses **ws**.

### Everyday commands

```bash
npm run dev          # server (4200) + client (4201) concurrently
npm run dev:server   # server only (tsx watch)
npm run dev:client   # Vite dev client only
npm run build        # production build: server → client → CLI
npm run typecheck    # tsc --noEmit for server and client
npm test             # vitest (server + CLI) + core-compat check
```

Tests use vitest with `:memory:` SQLite databases.

---

## Data layout

```
~/.specrails/
  hub.sqlite              # project registry (id, name, path, slug, provider…)
  hub.token               # auth token, mode 0600 (auto-generated on first run)
  manager.pid             # server PID for clean shutdown
  projects/
    <slug>/
      jobs.sqlite         # per-project: jobs, rails, tickets, invocations, …
      jobs/<jobId>/       # per-job snapshots (profile.json, plugins.json, …)
      telemetry/          # OTEL blobs (compacted after 7 days)
      explore-cwd/        # hub-managed Explore spawn cwd (CLAUDE.md + ./project link)
      terminals/          # per-session shell-integration shims
```

The hub SQLite (`hub.sqlite`) stores only project metadata. All per-project data lives in an isolated `jobs.sqlite` under the project's slug directory — not just jobs and chat, but rails, tickets, agent profiles/versions, AI invocations (cost analytics), telemetry pointers, file provenance, terminal settings/marks, and more (see the `MIGRATIONS` array in `server/db.ts`). Projects can be removed and re-added without losing history, and the registry can be wiped without touching project data.

> The data root is hardcoded to `os.homedir()/.specrails`. There is no environment override for the data directory.

---

## Hub architecture

Hub is the **only** supported mode — a single Express process manages every registered project. There is no legacy/non-hub runtime, and no mode detection.

```
┌─────────────────────────────────────────────────────┐
│  Express Server (port 4200, 127.0.0.1 only)         │
│                                                     │
│  ProjectRegistry                                    │
│  ├── Project A → ProjectContext { db, queue, chat,  │
│  ├── Project B →   chatManager, setupManager, cwd } │
│  └── Project C → …                                  │
│                                                     │
│  Routes:                                            │
│  /api/hub/*              → hub-level operations     │
│  /api/projects/:id/*     → project-scoped actions   │
│  /otlp/v1/*              → OTLP telemetry receiver   │
└─────────────────────────────────────────────────────┘
```

### Per-project isolation

Each project in the `ProjectRegistry` gets its own `ProjectContext`:

| Resource | Description |
|----------|-------------|
| `db` | SQLite connection to `projects/<slug>/jobs.sqlite` |
| `QueueManager` | Serialized job queue for this project (one active job at a time) |
| `ChatManager` | Isolated conversation manager (Explore + sidebar chat) |
| `SetupManager` | Wizard state for projects being onboarded |
| `cwd` | Absolute path to the project directory on disk |

The `boundBroadcast` closure injects `projectId` into all WebSocket messages, so managers don't need per-project constructor arguments.

---

## Key server modules

| Module | Responsibility |
|--------|---------------|
| `index.ts` | Entry point: PATH resolution, auth bootstrap, port binding, router mounts, WS server |
| `auth.ts` | Token bootstrap + `requireAuth` middleware + WS upgrade token check |
| `hub-db.ts` | Hub-level SQLite: project registry CRUD, hub settings |
| `project-registry.ts` | `ProjectRegistry` class: load/unload per-project `ProjectContext` |
| `hub-router.ts` | `/api/hub/*` routes: projects, settings, themes, specrails-tech proxy, hub analytics |
| `project-router.ts` | `/api/projects/:id/*` routes: all project-scoped operations |
| `db.ts` | Per-project SQLite: schema (`MIGRATIONS`) + queries |
| `queue-manager.ts` | Job queue: spawn provider CLI processes serially per project |
| `chat-manager.ts` | Chat/Explore: spawn provider CLI for conversational turns |
| `setup-manager.ts` | Setup wizard: orchestrate `specrails-core` install + `/setup` chat |
| `config.ts` | Command discovery: scan `<project>/.claude/commands/sr/*.md` |
| `hooks.ts` | Pipeline event handler: process phase transition events |
| `spending.ts` | Cost/analytics aggregation (single source of truth) |
| `ai-invocations.ts` | `recordInvocation` — writes one billable row per AI CLI call |
| `pricing.ts` | Rate-card cost fallback for providers without native billing |
| `result-event.ts` | `finaliseInvocationResult` — combines adapter result + pricing |
| `telemetry-receiver.ts` | OTLP/JSON receiver mounted at `/otlp` |
| `hub-analytics.ts` | Hub-level analytics aggregated across all projects |
| `metrics.ts` | Per-project health metrics |
| `docs-router.ts` | Serve the embedded docs portal (`/api/docs`) |
| `path-resolver.ts` | Resolve a usable PATH for GUI-launched desktop spawns |
| `types.ts` | Shared TypeScript interfaces |

Provider, terminal, profile, plugin, code-explorer, and explore subsystems each live in their own modules — see [Feature subsystems](#feature-subsystems).

---

## Client architecture

```
client/src/
├── App.tsx                     # Mounts HubProvider + HubApp unconditionally
├── components/
│   ├── TabBar.tsx              # Project tab switcher
│   ├── ProjectLayout.tsx       # Per-project three-panel wrapper
│   ├── ProjectNavbar.tsx       # Left/right sidebar pin + collapse toggles
│   ├── ArcSidebar.tsx          # Collapsible Arc-style left sidebar
│   ├── ProjectRightSidebar.tsx # Project nav (Jobs, Analytics, Agents, Code, …)
│   ├── TitleBar.tsx            # Custom frameless titlebar (desktop)
│   ├── CommandGrid.tsx         # Command launcher
│   ├── RecentJobs.tsx          # Job history card list
│   ├── ProjectHealthWidget.tsx # Per-project health indicators
│   ├── AddProjectDialog.tsx    # Register project modal (provider multi-select)
│   ├── WelcomeScreen.tsx       # Zero-state landing
│   └── SetupWizard.tsx         # Configure / Install / Done onboarding wizard
├── hooks/
│   ├── useHub.tsx              # HubProvider context: project list, active project
│   ├── useProjectCache.ts      # Stale-while-revalidate per-project cache
│   ├── useSpecGenTracker.tsx   # Quick-spec generation state (localStorage)
│   ├── usePipeline.ts          # Pipeline phase state
│   └── useSharedWebSocket.tsx  # Single WS connection, per-project filtering
├── pages/
│   ├── DashboardPage.tsx       # Specs board + Rails board + pipeline state
│   ├── AnalyticsPage.tsx       # Per-project cost analytics
│   ├── HubAnalyticsPage.tsx    # Cross-project spending roll-up
│   ├── AgentsPage.tsx          # Agent profiles + catalog
│   ├── CodePage.tsx            # Read-only code explorer (flag-gated)
│   ├── SettingsPage.tsx        # Per-project settings
│   ├── GlobalSettingsPage.tsx  # Hub settings
│   └── JobDetailPage.tsx       # Full log viewer for a single job
└── lib/
    ├── api.ts                  # getApiBase(): dynamic API prefix per active project
    ├── pending-specs.ts        # Quick-spec state persistence (localStorage)
    └── route-memory.ts         # Per-project URL route save/restore
```

### App bootstrap

`App.tsx` mounts `HubProvider` and `<HubApp />` **unconditionally** — there is no mode detection and no fallback layout. The client fetches its auth token same-origin from `/api/hub/token` and then loads the project registry.

### API base routing

`getApiBase()` (from `lib/api.ts`) always returns `${API_ORIGIN}/api/projects/<activeProjectId>` and **throws** when no active project is set — it never returns a bare `/api`. `HubProvider` updates the active project (via `setActiveProjectId`) on project switch; all API calls must go through `getApiBase()` rather than hardcoding `/api/projects/...`.

### Per-project tab switch pattern

On project switch:
1. `useHub` updates `activeProjectId`.
2. `useProjectCache` returns cached data immediately (no flicker).
3. A background fetch refreshes the cache for the new project.
4. Never reset to empty state — always show the last-known data while loading.

State-bearing hooks key off `activeProjectId` as a `useEffect` dependency. `useSpecGenTracker` (via `lib/pending-specs.ts`) and `lib/route-memory.ts` persist Quick-spec progress and the active URL route per project to `localStorage`, surviving refreshes and project switches.

---

## Authentication

The hub is local-first but **always authenticated** — auth is mandatory, not optional.

- On first run the server generates a token (two concatenated `randomUUID()`s) and persists it to `~/.specrails/hub.token` with mode `0600` (`server/auth.ts`).
- `app.use('/api', requireAuth)` protects every `/api/*` route. The exceptions are `GET /api/health` and `GET /api/hub/token` (both mounted before the middleware), plus `/api/docs` (the docs portal handlers respond before the auth fallthrough).
- `requireAuth` accepts the token as an `Authorization: Bearer <token>` header **or** an `X-Hub-Token: <token>` header.
- WebSocket upgrades are authorized by `authorizeUpgrade`: the browser client sends the token as a subprotocol `hub-token.<token>`; the CLI can pass it as a `Bearer` header.

There is no UI to set or clear the token and it is not a hub setting. The browser client fetches it same-origin from `/api/hub/token`, which is why that one route is public.

---

## WebSocket protocol

A single WebSocket connection at `ws://127.0.0.1:4200/ws` multiplexes all application messages. Terminal PTY output flows over a dedicated `/ws/terminal/:id` socket so high-throughput terminal data cannot starve the event stream.

Every project-scoped message includes a `projectId` field; hub-level messages (`hub.project_added`, `hub.project_removed`, `hub.projects`) have none.

### Representative message types

Canonical shapes live in `server/types.ts`. The core dashboard messages:

| Type | Scope | Payload (key fields) |
|------|-------|----------------------|
| `init` | project | `{ projectName, phases, phaseDefinitions, logBuffer, recentJobs, queue, projectId }` — per-connection dashboard snapshot sent on (re)connect |
| `queue` | project | `{ jobs, activeJobId, paused, timestamp, projectId }` — full queue snapshot |
| `log` | project | `{ source: 'stdout'\|'stderr', line, timestamp, processId, projectId }` |
| `phase` | project | `{ phase, state, timestamp, projectId }` |
| `exit` | project | `{ code, signal, early }` — process exit replay on the WS upgrade |
| `hub.project_added` | hub | `{ project }` |
| `hub.project_removed` | hub | `{ projectId }` |
| `hub.projects` | hub | `{ projects }` |

Job lifecycle is reported by the message types `job_started`, `job_completed`, `job_failed`, and `job_canceled`. Feature subsystems add many more (`spending.invalidated`, `plugin.*`, `file.*`, `rail.job_started/completed/stopped`, `explore.contract_refine_failed`, chat/refine/SMASH/proposal streams). See [`api-reference.md`](api-reference.md) for the full outbound-event catalogue.

### Client filtering pattern

WS handlers use a ref to avoid stale closures:

```tsx
const activeProjectIdRef = useRef(activeProjectId)
useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

// In a WS message handler:
if (msg.projectId && msg.projectId !== activeProjectIdRef.current) return
```

Hub-level messages (no `projectId`) are processed by all handlers.

---

## Process spawning and concurrency

`QueueManager` and `ChatManager` spawn the provider CLI (`claude` or `codex`) as subprocesses, always with `cwd` set so the process runs in the correct directory.

- **Within a project, jobs run strictly one at a time.** Each `ProjectContext` has exactly one `QueueManager` with a single `_activeJobId`; `_drainQueue()` early-returns while a job is active, so the next rail job queues behind the current one.
- **Parallelism is across projects only** — each project has its own `QueueManager`, so jobs in different projects run simultaneously. There is no "max concurrent jobs" setting; the only automatic queue-pause is budget-based (daily budget / per-job cost alert).
- **Cancelling a job** sends `SIGTERM`, waits **5 seconds**, then `SIGKILL`. (The terminal panel's 2-second shutdown grace is a separate subsystem.)
- A zombie-job watchdog terminates a stuck job after a default of **30 minutes**, overridable via `WM_ZOMBIE_TIMEOUT_MS`.
- Log lines stream back over WebSocket in real time.

---

## Feature subsystems

The hub is more than the job pipeline. Each subsystem owns its modules; this is a map, not a duplication of [`CLAUDE.md`](../../CLAUDE.md).

| Subsystem | Server modules | Notes |
|-----------|---------------|-------|
| **Multi-provider adapters** | `server/providers/{types,claude-adapter,codex-adapter,registry,index}.ts`, `server/provider-selection.ts` | Claude (full native support) and Codex (≥ 0.128.0, estimated cost, synthesized OTEL) behind a `ProviderAdapter` contract. A project can install both; `providers[]` is a JSON column, the first entry is primary. Per-invocation provider is late-bound. See [`adding-a-provider.md`](adding-a-provider.md). |
| **Spending analytics** | `server/spending.ts`, `server/ai-invocations.ts`, `server/pricing.ts` | `recordInvocation` writes an `ai_invocations` row per AI CLI call across six surfaces (`job`, `quick-spec`, `explore-spec`, `ai-edit`, `smash`, `file-summary`); powers the Analytics page and `spending.invalidated`. |
| **Agent profiles** | `server/profile-manager.ts`, `server/profiles-router.ts` | Declarative JSON in `.specrails/profiles/*.json`, snapshot-per-job, `SPECRAILS_PROFILE_PATH` env injection. Requires `specrails-core ≥ 4.1.0`. |
| **Plugins (Integrations)** | `server/plugin-manager.ts`, `server/plugins/` | Bundled-only, MCP-based, additivity invariant, surgical `.mcp.json` merge, `plugin.*` WS events. Serena ships today. |
| **Terminal panel** | `server/terminal-manager.ts` | `node-pty` sessions over the dedicated `/ws/terminal/:id` socket, OSC shell-integration marks. See [`../terminal.md`](../terminal.md). |
| **Code explorer** | `server/code-explorer-router.ts`, `server/file-provenance.ts`, `server/file-summary-manager.ts` | Read-only file tree + Monaco viewer + AI summaries; provenance per ticket/job. |
| **Pipeline telemetry** | `server/telemetry-receiver.ts` + QueueManager OTEL injection | Opt-in OTLP/JSON signals to `POST /otlp/v1/{traces,metrics,logs}`; blobs compacted after 7 days; diagnostic ZIP export. |
| **Explore acceleration + Contract Refine** | `server/explore-cwd-manager.ts`, `server/contract-refine-runner.ts` | Hub-managed Explore spawn cwd for fast first-token; optional post-commit Contract Layer enrichment. Kill switches: `SPECRAILS_EXPLORE_CONTRACT_REFINE`, `SPECRAILS_EXPLORE_LEGACY_CWD`. |
| **Tickets / drafts** | `server/ticket-store.ts` | Spec tickets (incl. `draft` status) backing the Specs board and Save-as-Draft flow. |
| **Theme system** | `server/hub-router.ts` (`GET/PATCH /api/hub/theme`) | Five built-in themes (`dracula`, `aurora-light`, `obsidian-dark`, `matrix`, `specrails`), default `specrails`, persisted hub-wide with an anti-FOUC inline script. |

Most client feature sections are gated by VITE flags, and they share one polarity: `VITE_FEATURE_TERMINAL_PANEL`, `VITE_FEATURE_AGENTS_SECTION`, `VITE_FEATURE_EXPLORE_PREMIUM_UX`, and `VITE_FEATURE_CODE_EXPLORER` are all **opt-out** — default ON, set the flag to `false` to hide that section. See [`configuration.md`](configuration.md) for the full flag and settings reference.

---

## Setup wizard flow

When a project is added without specrails-core, the setup wizard runs. The client renders a **3-step** indicator: **Configure → Install → Done**.

1. **Configure** — confirm path and pick provider(s) and model presets. (Multi-provider projects get one Configure step per provider.)
2. **Install** — the hub writes `.specrails/install-config.yaml` and runs `npx --yes --prefer-online specrails-core@latest init --yes --from-config <tempPath>`, streaming the log. For multi-provider projects each provider's install runs sequentially.
3. **Done** — per-provider completion summary.

`SetupManager` (server) owns wizard state; `HubProvider` (client) tracks which projects are in setup via `setupProjectIds`. The wizard does spawn a real AI CLI for the `/setup` chat, but that spawn is deliberately left uninstrumented (it writes no `ai_invocations` row).

---

## Desktop app layer

The **Tauri v2** desktop app wraps the Vite-built React client as a native macOS/Windows app.

- **Server sidecar** — `scripts/build-sidecar.mjs` compiles the Express server to a standalone binary. Tauri bundles it and manages its lifecycle.
- **Frameless window** — `tauri.conf.json` sets `decorations: false` on all platforms; the custom titlebar (drag region, window controls) is rendered in `TitleBar.tsx`. On macOS the native traffic-light controls are handled there.
- **GUI-launch PATH** — when launched from Finder/Dock the embedded server inherits a minimal launchd PATH, so `server/path-resolver.ts` resolves a usable PATH before any subprocess spawns (prepending well-known package-manager dirs, or the bundled runtime dirs in desktop mode).
- **Bundled runtimes** — in desktop mode the Tauri host sets `SPECRAILS_IS_DESKTOP=1` and `SPECRAILS_BUNDLED_RUNTIMES_PATH=<resource_dir>/runtimes` (only when a non-empty `runtimes/` dir is bundled), so the app can run without a system Node/Git. When no bundled runtimes are present it falls back to the system PATH.

### Desktop commands

```bash
npm run dev:desktop      # tauri dev (development desktop app)
npm run build:desktop    # build:server + client build + build:sidecar + tauri build
npm run generate-icons   # tauri icon src-tauri/icons/icon.svg
```

> There is no `npm run tauri` script — `npm run tauri dev` / `npm run tauri build` fail with "Missing script: tauri".

macOS desktop builds are signed + notarized. Windows builds (x64 and arm64) ship **unsigned** in v1 (SmartScreen "More info → Run anyway"). See [`../platforms/windows.md`](../platforms/windows.md) and [`../platforms/macos.md`](../platforms/macos.md).

---

## Ports

| Port | Service |
|------|---------|
| `4200` | Express server (API + WebSocket), bound to `127.0.0.1` (overridable via `--port`) |
| `4201` | Vite dev server (proxies `/api` and `/hooks` to 4200) |

---

## Security model

- **Loopback-only bind** — the server listens on `127.0.0.1` and is not exposed to a network.
- **Mandatory token auth** — every `/api/*` route and every WebSocket upgrade requires the hub token (see [Authentication](#authentication)). The token lives in `~/.specrails/hub.token` (mode `0600`).
- **Origin check** — a CORS middleware rejects cross-origin (non-localhost `Origin`) requests with `403`.
- **Parameterized SQL** — all SQLite operations use parameterized queries; user input is never string-interpolated into SQL.
- **Path validation** — project paths are validated as existing directories on registration.

---

## See also

- [API reference](api-reference.md) — REST routes and the full WebSocket event catalogue
- [Configuration](configuration.md) — env vars, feature flags, hub/project settings
- [Agent profiles](profiles.md) — profile schema, resolution order, snapshot-per-job
- [Adding a provider](adding-a-provider.md) — the `ProviderAdapter` contract
- [OpenSpec workflow](openspec-workflow.md) — the spec-driven change lifecycle
- [Operations runbook](operations-runbook.md) — running, upgrading, and recovering the hub
