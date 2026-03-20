# Platform Overview

This document explains the mental model behind specrails-hub: what it is, how the pieces fit together, and what happens when you run a command.

---

## The specrails ecosystem

```
┌─────────────────────────────────────────────────────────┐
│                     specrails-hub                        │
│                                                         │
│   Dashboard (browser)  ←→  Express + WebSocket server  │
│   CLI (specrails-hub)  ──→  /api/spawn                  │
│                              │                          │
│              ┌───────────────┼───────────────┐          │
│              │               │               │          │
│         Project A       Project B       Project C       │
│         (context)       (context)       (context)       │
│              │               │               │          │
└──────────────┼───────────────┼───────────────┼──────────┘
               │               │               │
        specrails-core   specrails-core   specrails-core
        (Claude CLI)     (Claude CLI)     (Claude CLI)
```

**specrails-core** is the AI pipeline engine installed per-project. It defines the pipeline phases and runs Claude.

**specrails-hub** is the local server that manages multiple specrails-core projects from one place. It provides the dashboard UI, job queues, analytics, and the CLI bridge.

---

## Hub mode vs. Legacy mode

### Hub mode (default)

One Express server manages multiple projects. Each project gets its own isolated context:
- Its own SQLite database at `~/.specrails/projects/<slug>/jobs.sqlite`
- Its own job queue (`QueueManager`)
- Its own chat history (`ChatManager`)
- Its own setup state (`SetupManager`)

The CLI auto-detects which project to use based on the current working directory.

### Legacy mode

For single-project setups (older installations). Activated with the `--legacy` flag:

```bash
specrails-hub start --legacy
```

In legacy mode, there is no project registry — the server manages one project directly.

---

## Key concepts

### Projects

A project is a directory on your machine that contains a specrails-core installation. You register it with specrails-hub by its absolute path. The hub assigns it an ID and a slug (derived from the directory name).

### Jobs

A job is a single Claude CLI invocation. Each time you run a command (e.g., `implement`, `batch-implement`), the hub creates a job record, spawns Claude, and streams the output.

Job records include: command, start time, duration, exit code, token usage, and cost.

### Pipeline phases

specrails-core organizes work into four sequential phases:

| Phase | Agent | What happens |
|-------|-------|--------------|
| Architect | `sr-architect` | Designs the solution, creates artifacts |
| Developer | `sr-developer` | Implements the code |
| Reviewer | `sr-reviewer` | Reviews and fixes issues |
| Ship | `sr-shipper` | Deploys or finalizes the change |

The dashboard visualizes which phase is active and streams its logs in real-time.

### Changes (OpenSpec)

A Change is the structured unit of work in the OpenSpec workflow. It groups together a set of artifacts (specs, tasks, implementation notes) that describe a feature or fix from start to finish. See [OpenSpec Workflow](../product/openspec-workflow.md) for the full lifecycle.

---

## Real-time logs via WebSocket

A single WebSocket connection from the browser receives all events:

- **Log lines** — raw stdout/stderr from Claude processes, tagged with `projectId` and `processId`
- **Phase events** — `phase` messages indicating which pipeline phase is active
- **Hub events** — `hub.project_added`, `hub.project_removed` for the project list

The dashboard filters messages by the currently selected project. Switching projects does not reconnect — it just changes the filter.

---

## Data layout

Everything specrails-hub stores lives under `~/.specrails/`:

```
~/.specrails/
  hub.sqlite                        # Project registry (names, paths, IDs)
  manager.pid                       # PID of the running server process
  hub.log                           # Server stdout/stderr log
  projects/
    <project-slug>/
      jobs.sqlite                   # Job history for this project
```

Project source code is never copied or modified by the hub. The hub only reads the project path and runs CLI commands inside it.

---

## Ports

| Port | Service |
|------|---------|
| 4200 | Express server — API (`/api/*`) and WebSocket |
| 4201 | Vite dev server (development only) — proxies to 4200 |

In production, only port 4200 is used.

---

## Further reading

- [Getting Started](getting-started.md) — installation and first run
- [Workflows](../product/workflows.md) — common step-by-step workflows
- [Configuration](../engineering/configuration.md) — all settings and CLI flags
