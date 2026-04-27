# Architecture

This document describes the technical architecture of specrails-hub: its layers, data layout, request flow, and key design decisions.

---

## Three-layer monorepo

```
specrails-hub/
├── server/       → Express + WebSocket + SQLite (TypeScript, CommonJS)
├── client/       → React + Vite + Tailwind v4 (TypeScript, ESM)
├── cli/          → specrails-hub CLI bridge (TypeScript, CommonJS)
└── src-tauri/    → Tauri desktop shell (Rust + bundled server sidecar)
```

Server and CLI compile to **CommonJS** (root `tsconfig.json`). The client is **ESM** with its own `client/tsconfig.json`. Each layer has its own `package.json` and `node_modules` — two separate `npm install` calls are required.

---

## Data layout

```
~/.specrails/
  hub.sqlite              # project registry (project id, name, path, slug)
  manager.pid             # server PID for clean shutdown
  projects/
    <slug>/
      jobs.sqlite         # per-project: jobs, events, chat conversations
```

The hub SQLite (`hub.sqlite`) stores only project metadata. All per-project data lives in an isolated `jobs.sqlite` under the project's slug directory. This means projects can be removed and re-added without losing their history, and the registry can be wiped without touching project data.

---

## Hub mode (default)

The server runs in **hub mode** by default — a single Express process manages all registered projects.

```
┌─────────────────────────────────────────────────────┐
│  Express Server (port 4200)                         │
│                                                     │
│  ProjectRegistry                                    │
│  ├── Project A → { db, queue, chat, cwd }          │
│  ├── Project B → { db, queue, chat, cwd }          │
│  └── Project C → { db, queue, chat, cwd }          │
│                                                     │
│  Routes:                                            │
│  /api/hub/*              → hub-level operations     │
│  /api/projects/:id/*     → project-scoped actions   │
└─────────────────────────────────────────────────────┘
```

### Per-project isolation

Each project in the `ProjectRegistry` gets its own `ProjectContext`:

| Resource | Description |
|----------|-------------|
| `db` | SQLite connection to `projects/<slug>/jobs.sqlite` |
| `QueueManager` | Sequential job queue for this project |
| `ChatManager` | Isolated Claude conversation manager |
| `SetupManager` | Wizard state for projects being onboarded |
| `cwd` | Absolute path to the project directory on disk |

The `boundBroadcast` closure injects `projectId` into all WebSocket messages so managers don't need per-project constructor arguments.

---

## Key server modules

| Module | Responsibility |
|--------|---------------|
| `index.ts` | Entry point: mode detection, port binding, WebSocket server |
| `hub-db.ts` | Hub-level SQLite: project registry CRUD |
| `project-registry.ts` | `ProjectRegistry` class: load/unload per-project `ProjectContext` |
| `hub-router.ts` | `/api/hub/*` routes: project management, global settings, agents, specrails-tech proxy |
| `project-router.ts` | `/api/projects/:id/*` routes: all project-scoped operations |
| `db.ts` | Per-project SQLite: jobs, events, chat schema and queries |
| `queue-manager.ts` | Job queue: spawn claude CLI processes sequentially per project |
| `chat-manager.ts` | Chat: spawn claude CLI for conversational sessions |
| `setup-manager.ts` | Setup wizard: orchestrate specrails-core installation and `/setup` chat |
| `config.ts` | Command discovery: read available `/sr:*` commands from project |
| `hooks.ts` | Pipeline event handler: process phase transition events |
| `analytics.ts` | Metrics aggregation: cost, tokens, duration per project |
| `metrics.ts` | Project health metrics |
| `docs-router.ts` | Serve the embedded docs portal |
| `hub-analytics.ts` | Hub-level analytics aggregated across all projects |
| `types.ts` | Shared TypeScript interfaces |

---

## Client architecture

```
client/src/
├── App.tsx                    # Mode detection; renders HubApp or legacy RootLayout
├── components/
│   ├── TabBar.tsx             # Project tab switcher
│   ├── ProjectLayout.tsx      # Per-project three-panel wrapper
│   ├── ProjectNavbar.tsx      # Home / Analytics / Conversations nav
│   ├── ArcSidebar.tsx         # Collapsible Arc-style left sidebar
│   ├── ProjectRightSidebar.tsx # Project-level right panel
│   ├── TitleBar.tsx           # Custom frameless titlebar (Windows/Linux)
│   ├── CommandGrid.tsx        # Command launcher (DISCOVERY + DELIVERY)
│   ├── RecentJobs.tsx         # Job history table
│   ├── HubTodayWidget.tsx     # Hub-level daily summary
│   ├── ProjectHealthWidget.tsx # Per-project health indicators
│   ├── AddProjectDialog.tsx   # Register project modal
│   ├── WelcomeScreen.tsx      # Zero-state landing
│   └── SetupWizard.tsx        # 5-phase onboarding wizard
├── hooks/
│   ├── useHub.tsx             # HubProvider context: project list, active project
│   ├── useProjectCache.ts     # Stale-while-revalidate per-project cache
│   ├── useSpecGenTracker.tsx  # Spec generation state (persists via localStorage)
│   ├── usePipeline.ts         # Pipeline phase state
│   └── useSharedWebSocket.tsx # Single WS connection, per-project filtering
├── pages/
│   ├── DashboardPage.tsx      # CommandGrid + RecentJobs + pipeline state
│   ├── AnalyticsPage.tsx      # Metrics charts and tables
│   ├── ActivityFeedPage.tsx   # Chronological event log
│   ├── ConversationsPage.tsx  # Chat sessions
│   ├── GlobalSettingsPage.tsx # Hub settings modal
│   └── JobDetailPage.tsx      # Full log viewer for a single job
└── lib/
    ├── api.ts                 # getApiBase(): dynamic API prefix per active project
    ├── pending-specs.ts       # Spec generation state persistence (localStorage)
    └── route-memory.ts        # Per-project URL route save/restore
```

### Hub mode detection

`App.tsx` calls `GET /api/hub/state` on load. If it succeeds, the app renders in hub mode (`HubApp`). If the endpoint is absent, it falls back to legacy `RootLayout`.

### API base routing

`getApiBase()` (from `lib/api.ts`) returns `/api/projects/<activeProjectId>` in hub mode and `/api` in legacy mode. All API calls must use this prefix — never hardcode `/api/projects/...`.

`HubProvider` updates the base when the active project changes. Never cache the result.

### Per-project tab switch pattern

On project switch:
1. `useHub` updates `activeProjectId`.
2. `useProjectCache` returns cached data immediately (no flicker).
3. A background fetch refreshes the cache for the new project.
4. Never reset to empty state — always show the last-known data while loading.

### Spec generation tracking

`useSpecGenTracker` persists in-progress spec generation state to `localStorage` via `lib/pending-specs.ts`. State survives page refreshes and project switches. `lib/route-memory.ts` provides the equivalent persistence for the active URL route per project.

---

## Desktop App Layer

The Tauri v1 desktop app wraps the Vite-built React client as a native macOS/Windows/Linux application.

- **Server sidecar** — `scripts/build-sidecar.mjs` compiles the Express server to a standalone binary (`specrails-server-aarch64-apple-darwin` on macOS). Tauri bundles this binary and manages its lifecycle.
- **macOS titlebar** — `titleBarStyle: Overlay` in `tauri.conf.json` keeps native traffic lights. A custom drag region and centered search pill are rendered in `TitleBar.tsx`.
- **Windows/Linux titlebar** — frameless window with a fully custom titlebar in `TitleBar.tsx`: SR icon, app name, and window controls (minimize/maximize/close).
- **Icon** — dark `#282a36` background, purple S / pink R in monospace bold (matches specrails-web favicon). All icon sizes regenerated via `scripts/generate-icons.mjs`.

```bash
npm run tauri dev      # Development mode
npm run tauri build    # Production build
node scripts/generate-icons.mjs    # Regenerate icon sizes from SVG
node scripts/build-sidecar.mjs     # Build server sidecar binary
```

---

## WebSocket protocol

A single WebSocket connection at `ws://127.0.0.1:4200` carries all messages. Every project-scoped message includes a `projectId` field. Hub-level messages have no `projectId`.

### Message types

| Type | Scope | Payload |
|------|-------|---------|
| `init` | project | `{ jobId, command, projectId }` |
| `log` | project | `{ jobId, line, projectId }` |
| `phase` | project | `{ phase, status, projectId }` |
| `done` | project | `{ jobId, exitCode, duration, cost, tokens, projectId }` |
| `queue_update` | project | `{ queue, projectId }` |
| `hub.project_added` | hub | `{ project }` |
| `hub.project_removed` | hub | `{ projectId }` |
| `hub.projects` | hub | `{ projects }` |

### Client filtering pattern

WS handlers use a ref to avoid stale closures:

```tsx
const activeProjectIdRef = useRef(activeProjectId)
useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

// In WS message handler:
if (msg.projectId && msg.projectId !== activeProjectIdRef.current) return
```

Hub-level messages (no `projectId`) are processed by all handlers.

---

## Process spawning

`QueueManager` and `ChatManager` both spawn `claude` CLI subprocesses:

- `cwd` is set to `project.path` so Claude operates in the correct project directory.
- `QueueManager` runs jobs sequentially per project (jobs across different projects run in parallel).
- `ChatManager` keeps a streaming subprocess alive for the duration of a chat message.
- Log lines are streamed back via WebSocket in real-time.

---

## Setup wizard flow

When a project is added without specrails-core, a 5-phase wizard runs automatically:

```
Phase 1: Path input          → AddProjectDialog
Phase 2: Installation proposal → SetupWizard (confirm step)
Phase 3: npx specrails-core  → SetupWizard (live log stream)
Phase 4: /setup chat         → CheckpointTracker (left) + SetupChat (right)
Phase 5: Completion summary  → SetupWizard (done screen)
```

`SetupManager` (server) owns wizard state. `HubProvider` (client) tracks which projects are in-setup via `setupProjectIds`.

---

## Ports

| Port | Service |
|------|---------|
| `4200` | Express server (API + WebSocket) |
| `4201` | Vite dev server (proxies `/api` and `/hooks` to 4200) |

---

## Security model

- Binds to `127.0.0.1` (loopback only) — **do not expose to a network**.
- No authentication — single-user local tool.
- All SQL operations use parameterized queries.
- Project paths validated as existing directories on registration.
