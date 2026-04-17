# specrails hub

A local dashboard and CLI for managing all your [specrails-core](https://github.com/fjpulidop/specrails-core) projects from a single interface. Visualizes the AI pipeline phases (Architect, Developer, Reviewer, Ship), streams logs in real-time, and lets you launch commands from the browser, terminal, or native desktop app.

## Features

- **Multi-project hub** — register multiple specrails projects and switch between them with browser-style tabs
- **Live pipeline visualization** — see Architect, Developer, Reviewer, and Ship phases update in real-time
- **Streaming logs** — all `claude` CLI output streamed via WebSocket to the browser
- **Ticket panel** — visual interface for local tickets with List, Kanban, and Post-it views; real-time sync with CLI agents
- **Command launcher** — organized into Discovery (propose-spec, auto-propose specs, auto-select specs) and Delivery (implement, batch-implement) sections; other commands available in a collapsible group
- **Analytics** — cost, duration, token usage, and throughput metrics per project
- **Conversations** — full-page chat interface with Claude, scoped per project
- **Native desktop app (macOS/Windows/Linux via Tauri)** — installable app that bundles the server; macOS uses native traffic lights with a custom titlebar, Windows/Linux use a custom frameless titlebar
- **Demo mode for offline previews** — run the UI with fixture data, no server required
- **Persistent spec generation state across refreshes** — in-progress spec generation survives page reloads and project switches
- **`specrails-hub` CLI** — terminal bridge that auto-routes commands to the correct project

## Prerequisites

- Node.js 18+
- `claude` CLI on your PATH ([Claude Code](https://claude.com/claude-code))
- At least one project with specrails-core installed (`npx specrails-core`)

## Installation

```bash
npm install -g specrails-hub
```

## Quick Start

```bash
# Start the hub server
specrails-hub start

# Register a project
specrails-hub add /path/to/your/project

# Open in browser
open http://localhost:4200
```

On first launch with no projects, you'll see a welcome screen with an "Add your first project" button.

## Desktop App

```bash
npm run tauri dev      # Run desktop app in development mode
npm run tauri build    # Build production desktop app
```

macOS: native traffic lights with a custom drag region and centered search pill. Windows/Linux: custom frameless titlebar with SR icon, app name, and window controls.

## Architecture

```
~/.specrails/
  hub.sqlite              # project registry (name, path, slug)
  manager.pid             # server PID for clean shutdown
  projects/
    my-app/jobs.sqlite    # isolated DB per project (jobs, events, chat)
    api-srv/jobs.sqlite
```

A single Express process (port 4200) manages all projects. Each project gets its own:

- **SQLite database** — jobs, events, chat conversations
- **QueueManager** — independent job queue (sequential within a project, parallel across projects)
- **ChatManager** — isolated Claude conversations

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

### Three-layer monorepo

```
specrails-hub/
├── server/       → Express + WebSocket + SQLite (TypeScript, CommonJS)
├── client/       → React + Vite + Tailwind v4 (TypeScript, ESM)
├── cli/          → specrails-hub CLI bridge (TypeScript, CommonJS)
└── src-tauri/    → Tauri desktop shell (Rust + bundled server sidecar)
```

## UI Overview

```
┌───────────────────────────────────────────────────────┐
│  specrails hub   [my-app ●] [api-srv] [dashboard] [+]│
│  Home   Analytics   Conversations                  ⚙ │
│───────────────────────────────────────────────────────│
│                                                       │
│  Command grid, recent jobs, pipeline phases           │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- **Tabs** — one per project, green dot when a job is active
- **Home** — command grid (Discovery and Delivery sections), ticket panel, recent jobs, pipeline phase indicators
- **Tickets** — List, Kanban, and Post-it views of local tickets; real-time sync with CLI agents
- **Analytics** — cost and token metrics
- **Conversations** — Claude chat sessions scoped to the project
- **Settings** (gear icon) — global hub configuration, registered projects

## CLI: `specrails-hub`

### Hub management

| Command | Description |
|---------|-------------|
| `specrails-hub start [--port N]` | Start the hub server (default port 4200) |
| `specrails-hub stop` | Stop the hub server |
| `specrails-hub status` | Show hub state and registered projects |
| `specrails-hub list` | List all registered projects |
| `specrails-hub add <path>` | Register a project |
| `specrails-hub remove <id>` | Unregister a project |

### Running commands

```bash
cd ~/repos/my-app
specrails-hub implement #42          # auto-detects project from CWD
specrails-hub product-backlog        # routes to the correct project
specrails-hub "any raw prompt"       # passes directly to claude
```

`specrails-hub` detects which project you're in by matching your current directory against registered projects. If the hub isn't running, it falls back to invoking `claude` directly.

### Options

| Flag | Description |
|------|-------------|
| `--port <n>` | Override default port (4200) |
| `--status` | Print hub/manager state |
| `--jobs` | Print recent job history |
| `--help` | Show usage |

### Output

```
[specrails-hub] running: /sr:implement #42
[specrails-hub] routing via hub → project my-app (a1b2c3d4)
... (live claude output) ...
[specrails-hub] done  duration: 4m32s  cost: $0.08  tokens: 12,400  exit: 0
```

## API

### Hub routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hub/state` | Hub version, project count, uptime |
| GET | `/api/hub/projects` | List registered projects |
| POST | `/api/hub/projects` | Register a project (`{ path }`) |
| DELETE | `/api/hub/projects/:id` | Unregister a project |
| GET | `/api/hub/resolve?path=<p>` | Find project by filesystem path |
| GET | `/api/hub/settings` | Global settings |
| PUT | `/api/hub/settings` | Update global settings |

### Project-scoped routes

All under `/api/projects/:projectId/`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/spawn` | Launch a command |
| GET | `/jobs` | Job history |
| GET | `/jobs/:id` | Job detail |
| GET | `/analytics` | Cost and usage metrics |
| GET | `/config` | Available commands |
| POST | `/chat/conversations` | Create chat conversation |
| GET | `/chat/conversations` | List conversations |
| POST | `/hooks/events` | Pipeline phase notifications |
| GET | `/tickets` | List tickets (`?status=`, `?label=`, `?q=` filters supported) |
| GET | `/tickets/:id` | Get ticket by ID |
| POST | `/tickets` | Create ticket |
| PATCH | `/tickets/:id` | Update ticket fields |
| DELETE | `/tickets/:id` | Delete ticket |
| GET | `/integration-contract` | Read project integration-contract.json |

## Development

```bash
git clone https://github.com/fjpulidop/specrails-hub.git
cd specrails-hub
npm install          # install root (server + CLI) dependencies
cd client && npm install && cd ..   # install client dependencies separately
npm run dev          # starts server (4200) + client (4201) concurrently
```

> **Note:** This repo has two separate `node_modules` trees — one at the root (server + CLI) and one inside `client/` (Vite + React). Both `npm install` calls are required. If you see `sh: tsc: command not found` during `npm run build`, it means one of them is missing.

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + client with hot reload |
| `npm run dev:server` | Server only (tsx watch) |
| `npm run dev:client` | Client only (Vite) |
| `npm run build` | Production build (server + client + CLI) |
| `npm run typecheck` | TypeScript check (server + client) |
| `npm test` | Run tests (vitest) |

### Project structure

```
specrails-hub/
├── server/
│   ├── index.ts              # hub entry point
│   ├── hub-db.ts             # hub SQLite (project registry)
│   ├── project-registry.ts   # per-project context manager
│   ├── hub-router.ts         # /api/hub/* routes
│   ├── project-router.ts     # /api/projects/:id/* routes (includes ticket endpoints)
│   ├── ticket-store.ts       # local-tickets.json read/write with file locking
│   ├── ticket-watcher.ts     # chokidar watcher → WebSocket broadcast
│   ├── db.ts                 # per-project SQLite (jobs, events, chat)
│   ├── queue-manager.ts      # job queue per project
│   ├── chat-manager.ts       # Claude chat per project
│   ├── config.ts             # command discovery
│   ├── hooks.ts              # pipeline event handler
│   ├── analytics.ts          # metrics aggregation
│   └── types.ts              # shared TypeScript types (includes ticket WS messages)
├── client/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── TabBar.tsx           # project tabs
│       │   ├── AddProjectDialog.tsx # register project modal
│       │   ├── WelcomeScreen.tsx    # zero-state
│       │   ├── ProjectLayout.tsx    # per-project wrapper
│       │   ├── ProjectNavbar.tsx    # Home/Analytics/Conversations nav
│       │   ├── CommandGrid.tsx      # command launcher
│       │   ├── TitleBar.tsx         # custom titlebar (Windows/Linux frameless)
│       │   ├── ArcSidebar.tsx       # collapsible Arc-style sidebar
│       │   ├── ProjectRightSidebar.tsx # project-level right panel
│       │   ├── TicketsSection.tsx   # ticket panel container (view mode toggle)
│       │   ├── TicketListView.tsx   # sortable table view
│       │   ├── TicketGridView.tsx   # kanban drag-and-drop view
│       │   ├── TicketPostItView.tsx # sticky-note grid view
│       │   ├── TicketDetailModal.tsx # ticket editor modal
│       │   ├── CreateTicketModal.tsx # new ticket form
│       │   ├── TicketStatusIndicator.tsx # status dot, badge, border
│       │   ├── TicketContextMenu.tsx # right-click menu
│       │   └── ...
│       ├── hooks/
│       │   ├── useHub.tsx           # hub state context
│       │   ├── useSpecGenTracker.tsx # spec generation state (persists via localStorage)
│       │   ├── useTickets.ts        # ticket CRUD + WS subscription + toast/glow
│       │   ├── useChat.ts          # chat operations
│       │   ├── usePipeline.ts      # pipeline phases
│       │   └── useSharedWebSocket.tsx
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── AnalyticsPage.tsx
│       │   ├── ConversationsPage.tsx
│       │   ├── GlobalSettingsPage.tsx
│       │   └── JobDetailPage.tsx
│       └── lib/
│           ├── api.ts              # dynamic API base routing
│           ├── pending-specs.ts    # spec generation state persistence
│           └── route-memory.ts     # per-project route save/restore
├── src-tauri/                      # Tauri desktop shell
├── scripts/
│   ├── build-sidecar.mjs           # build bundled server binary for Tauri
│   └── generate-icons.mjs          # regenerate all icon sizes from SVG
├── cli/
│   └── specrails-hub.ts            # CLI bridge
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## WebSocket

The server broadcasts events over a single WebSocket connection. All project-scoped messages include a `projectId` field — the client filters by active project.

| Message type | Scope | Description |
|-------------|-------|-------------|
| `init` | project | Job started |
| `log` | project | Streaming log line |
| `phase` | project | Pipeline phase transition |
| `queue_update` | project | Queue state change |
| `ticket_created` | project | New ticket created (via API or CLI) |
| `ticket_updated` | project | Ticket updated; if `ticket.id === 0`, signals a full external file change |
| `ticket_deleted` | project | Ticket deleted |
| `hub.project_added` | hub | New project registered |
| `hub.project_removed` | hub | Project unregistered |

## Security

- Binds to `127.0.0.1` (loopback only) — **do not expose to a network**
- No authentication (single-user local tool)
- All SQL operations use parameterized queries
- Project paths validated as existing directories on registration

## Support

If specrails-hub saves you time, you can donate on [Ko-fi](https://ko-fi.com/D1D81Y002C) ☕ to support ongoing development.

[![Donate on Ko-fi](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B?logo=kofi&logoColor=white&style=flat-square)](https://ko-fi.com/D1D81Y002C)

## License

MIT
