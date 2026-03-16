# specrails manager

A local dashboard and CLI for managing all your [specrails](https://github.com/fjpulidop/specrails) projects from a single interface. Visualizes the AI pipeline phases (Architect, Developer, Reviewer, Ship), streams logs in real-time, and lets you launch commands from the browser or terminal.

## Features

- **Multi-project hub** — register multiple specrails projects and switch between them with browser-style tabs
- **Live pipeline visualization** — see Architect, Developer, Reviewer, and Ship phases update in real-time
- **Streaming logs** — all `claude` CLI output streamed via WebSocket to the browser
- **Command launcher** — run `/sr:implement`, `/sr:product-backlog`, and other commands from the dashboard
- **Analytics** — cost, duration, token usage, and throughput metrics per project
- **Conversations** — full-page chat interface with Claude, scoped per project
- **`srm` CLI** — terminal bridge that auto-routes commands to the correct project

## Prerequisites

- Node.js 18+
- `claude` CLI on your PATH ([Claude Code](https://claude.com/claude-code))
- At least one project with specrails installed (`npx specrails`)

## Installation

```bash
npm install -g @specrails/manager
```

## Quick Start

```bash
# Start the hub server
srm hub start

# Register a project
srm hub add /path/to/your/project

# Open in browser
open http://localhost:4200
```

On first launch with no projects, you'll see a welcome screen with an "Add your first project" button.

## Architecture

```
~/.specrails/
  hub.sqlite              # project registry (name, path, slug)
  hub.pid                 # server PID for clean shutdown
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
- **Home** — command grid, recent jobs, pipeline phase indicators
- **Analytics** — cost and token metrics
- **Conversations** — Claude chat sessions scoped to the project
- **Settings** (gear icon) — global hub configuration, registered projects

## CLI: `srm`

### Hub management

| Command | Description |
|---------|-------------|
| `srm hub start [--port N]` | Start the hub server (default port 4200) |
| `srm hub stop` | Stop the hub server |
| `srm hub status` | Show hub state and registered projects |
| `srm hub list` | List all registered projects |
| `srm hub add <path>` | Register a project |
| `srm hub remove <id>` | Unregister a project |

### Running commands

```bash
cd ~/repos/my-app
srm implement #42          # auto-detects project from CWD
srm product-backlog        # routes to the correct project
srm "any raw prompt"       # passes directly to claude
```

`srm` detects which project you're in by matching your current directory against registered projects. If the hub isn't running, it falls back to invoking `claude` directly.

### Options

| Flag | Description |
|------|-------------|
| `--port <n>` | Override default port (4200) |
| `--status` | Print hub/manager state |
| `--jobs` | Print recent job history |
| `--help` | Show usage |

### Output

```
[srm] running: /sr:implement #42
[srm] routing via hub → project my-app (a1b2c3d4)
... (live claude output) ...
[srm] done  duration: 4m32s  cost: $0.08  tokens: 12,400  exit: 0
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

## Development

```bash
git clone https://github.com/fjpulidop/specrails-manager.git
cd specrails-manager
npm install
npm run dev          # starts server (4200) + client (4201) concurrently
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + client with hot reload |
| `npm run dev:server` | Server only (tsx watch) |
| `npm run dev:client` | Client only (Vite) |
| `npm run build` | Production build (client + CLI) |
| `npm run typecheck` | TypeScript check (server + client) |
| `npm test` | Run tests (vitest) |

### Project structure

```
specrails-manager/
├── server/
│   ├── index.ts              # hub entry point
│   ├── hub-db.ts             # hub SQLite (project registry)
│   ├── project-registry.ts   # per-project context manager
│   ├── hub-router.ts         # /api/hub/* routes
│   ├── project-router.ts     # /api/projects/:id/* routes
│   ├── db.ts                 # per-project SQLite (jobs, events, chat)
│   ├── queue-manager.ts      # job queue per project
│   ├── chat-manager.ts       # Claude chat per project
│   ├── config.ts             # command discovery
│   ├── hooks.ts              # pipeline event handler
│   ├── analytics.ts          # metrics aggregation
│   └── types.ts              # shared TypeScript types
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
│       │   └── ...
│       ├── hooks/
│       │   ├── useHub.tsx           # hub state context
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
│           └── api.ts              # dynamic API base routing
├── cli/
│   └── srm.ts                      # CLI bridge
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
| `hub.project_added` | hub | New project registered |
| `hub.project_removed` | hub | Project unregistered |

## Security

- Binds to `127.0.0.1` (loopback only) — **do not expose to a network**
- No authentication (single-user local tool)
- All SQL operations use parameterized queries
- Project paths validated as existing directories on registration

## License

MIT
