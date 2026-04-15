# Features

Reference guide to features available in specrails-hub.

---

## Sidebar

The collapsible sidebar on the left manages hub-level navigation.

- **Hover** to expand, **pin icon** to lock open.
- Lists all registered projects — click to switch active project.
- **+ Add project** button at the bottom of the project list.
- Bottom section: **Docs**, **Hub Analytics**, **Hub Settings**.

---

## Home (per project)

The landing page for the active project. Contains two sections:

### Specs

Local tickets for the project. Backed by `.specrails/local-tickets.json`.

- **+ Add Spec** — create a new spec (title, description, priority, labels).
- List, Grid (Kanban), and Post-it view modes.
- Real-time sync — changes from CLI agents appear instantly via WebSocket.
- Click any spec to edit. Drag cards in Grid view to change status.

See [Ticket Panel](tickets.md) for the full reference.

### Rails

Execution lanes. Drag specs into a Rail and click **Play** to run the pipeline.

Pipeline phases: **Architect → Developer → Reviewer → Ship**

Each phase runs a dedicated Claude Code agent in the project directory.

---

## Jobs (per project)

All pipeline jobs for the active project.

- Status: queued, running, completed, failed.
- Real-time log streaming — logs appear as Claude writes them.
- Cost tracking — token usage and USD cost per job.
- Duration, exit code, and timestamps.

Click any job to open the detail view with the full log.

---

## Project Analytics

Metrics for the active project over a configurable time window (1d, 7d, 30d, custom).

Charts and metrics:
- KPI summary (jobs run, success rate, total cost, avg duration)
- Cost timeline
- Status breakdown
- Duration histogram with percentiles
- Token efficiency
- Command performance
- Daily throughput
- Cost treemap by command
- Trends over time

Export data via the export dropdown (CSV/JSON).

---

## Project Settings

Configuration for the active project.

- **Issue tracker** — select GitHub or Jira as the source for the Implement wizard. Shows authentication status. Label filter to narrow issue lists.
- **Budget** — daily spend cap (USD). Queue auto-pauses when hit. Per-job cost alert threshold.

---

## Hub Analytics

Cross-project metrics. Shows aggregated data across all registered projects.

---

## Hub Settings

Hub-level configuration (not per-project).

---

## Command Palette

Open with **Cmd+K** (Mac) or **Ctrl+K** (Linux/Windows).

- Switch projects
- Launch spec commands (`/sr:*`)
- Navigate to recent jobs
- Navigate to any page

---

## Notification Center

Bell icon in the project top bar. Shows job completion alerts and budget warnings for the active project.

---

## CLI

Full CLI reference — see `specrails-hub --help`.

Key commands:

```bash
specrails-hub start                              # Start hub server
specrails-hub add <path>                         # Register project
specrails-hub list                               # List projects
specrails-hub remove <id>                        # Remove project
specrails-hub implement "#42"                    # Queue implement job (cwd project)
specrails-hub --project <name> implement "#42"  # Target project by name
specrails-hub /opsx:ff                          # OpenSpec fast-forward
specrails-hub /opsx:apply                       # Apply OpenSpec change
```

---

## OpenSpec (opsx)

Structured change management. Each change bundles a problem statement, spec, task list, and implementation notes. Run all `opsx:*` commands from the CLI.

See [OpenSpec Workflow](openspec-workflow.md) for the full reference.
