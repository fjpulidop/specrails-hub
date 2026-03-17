# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

specrails-manager is a local dashboard and CLI for managing multiple [specrails](https://github.com/fjpulidop/specrails) projects from a single interface. It visualizes AI pipeline phases (Architect → Developer → Reviewer → Ship), streams Claude CLI logs in real-time, and provides job queues, analytics, and chat per project.

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
cli/        → srm CLI bridge (TypeScript, CommonJS)
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
3. `npx specrails` execution with streaming log
4. Split-view: CheckpointTracker (left) + SetupChat with Claude `/setup` (right)
5. Completion summary

Managed by `SetupManager` (server) and `SetupWizard` component (client). Hub context tracks which projects are in setup via `setupProjectIds`.

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
