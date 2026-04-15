# Platform Overview

specrails-hub is a local multi-project dashboard that manages specrails-core installations. This document covers the mental model, architecture, and key concepts.

---

## How it works

```
Browser (4201)  ←→  Express + WebSocket (4200)  ←→  Claude CLI processes
                         │
                    SQLite databases
                    (~/.specrails/)
```

One hub server manages many projects. Each project gets its own SQLite database, job queue, and isolated process context. The browser talks exclusively to the hub via REST and WebSocket.

---

## Key concepts

### Projects

A project is a directory that has specrails-core installed. The hub tracks projects in `~/.specrails/hub.sqlite`. Each project stores its jobs in `~/.specrails/projects/<slug>/jobs.sqlite`.

Register a project with `specrails-hub add <path>` or via the dashboard sidebar.

### Specs

Specs are local tickets — descriptions of work to be done. They live in `.specrails/local-tickets.json` inside your project. Create them with **+ Add Spec** on the Home page. The hub watches this file and syncs changes in real-time.

### Rails

Rails are execution lanes on the Home page. Drag specs into a Rail and click **Play** to launch the pipeline for that spec. The pipeline runs: **Architect → Developer → Reviewer → Ship** via Claude CLI agents.

### Jobs

Every pipeline run is a job. Jobs have a status (queued → running → completed/failed), real-time log streaming, and cost tracking. Browse all jobs for the active project in the **Jobs** page.

### Agents

The pipeline uses specialized Claude Code agents. The four required agents are:

| Agent | Role |
|-------|------|
| `sr-architect` | Plans the implementation |
| `sr-developer` | Writes the code |
| `sr-reviewer` | Reviews the output |
| `sr-merge-resolver` | Resolves conflicts |

Optional agents (Test Writer, Doc Sync, Security Reviewer, etc.) can be added in the project configuration.

---

## Hub vs. project scope

| Scope | What it covers |
|-------|---------------|
| **Hub** | All projects — Hub Analytics, Hub Settings |
| **Project** | One active project — Jobs, Project Analytics, Project Settings |

The sidebar handles hub-level navigation. The ProjectNavbar (top bar) handles project-level navigation for the active project.

---

## Data layout

```
~/.specrails/
  hub.sqlite                       # project registry
  manager.pid                      # server PID
  hub.token                        # auth token (Bearer)
  projects/
    <slug>/
      jobs.sqlite                  # per-project jobs DB
```

Inside each project directory:

```
.specrails/
  local-tickets.json               # specs
  changes/                         # OpenSpec change artifacts
  backlog-config.json              # issue tracker config
```

---

## WebSocket protocol

All real-time updates come through a single WebSocket connection. Every project-scoped message includes `projectId`. The client filters by the active project. Hub-level messages (`hub.project_added`, `hub.project_removed`) have no `projectId` and reach all handlers.

---

## Authentication

The hub generates a Bearer token stored at `~/.specrails/hub.token`. All `/api/*` requests require this token. The CLI reads it automatically — no manual setup needed.

---

## Further reading

- [Features](../product/features.md) — full feature reference
- [Workflows](../product/workflows.md) — step-by-step guides
- [Architecture](../engineering/architecture.md) — technical deep-dive
