# Getting Started

specrails-hub is a local dashboard for managing multiple [specrails-core](https://github.com/fjpulidop/specrails-core) projects from one place. It runs an Express server that spawns Claude CLI agents, streams their output in real-time, and tracks jobs, analytics, and specs per project.

---

## Prerequisites

- Node.js 18+
- [specrails-core](https://github.com/fjpulidop/specrails-core) installed in at least one project
- Claude CLI available in your PATH

---

## Installation

```bash
npm install -g specrails-hub
```

---

## Starting the hub

```bash
specrails-hub start
```

Starts the Express server on port **4200** and opens the dashboard at `http://127.0.0.1:4200`.

---

## Adding your first project

**From the dashboard:**

1. Click **+** (add project) in the sidebar.
2. Enter the absolute path to your project (e.g. `/Users/you/repos/my-app`).
3. Click **Add**.

If specrails-core is not yet installed, a setup wizard launches automatically to install and configure it.

**From the CLI:**

```bash
specrails-hub add /path/to/your/project
```

---

## Desktop App

The Tauri desktop app is an alternative to opening the browser dashboard. It wraps the same React client as a native macOS/Windows/Linux app and bundles the server as a sidecar so no separate `specrails-hub start` is needed.

```bash
npm run tauri dev      # Run in development mode
npm run tauri build    # Build production app
```

**macOS** — native traffic lights with a custom drag region and centered search pill replace the standard titlebar.

**Windows / Linux** — custom frameless titlebar with SR icon, app name, and window controls.

---

## Dashboard layout

```
┌──────────┬─────────────────────────────────────────────────────┐
│          │  ProjectNavbar: Home · Jobs · Analytics · Settings  │
│ Sidebar  │                                                     │
│          │  Page content (Dashboard / Jobs / Analytics / ...)  │
│ Projects │                                                     │
│ ──────── │                                                     │
│ Docs     │                                                     │
│ Analytics│                                                     │
│ Settings │                                                     │
└──────────┴─────────────────────────────────────────────────────┘
```

- **Sidebar** — hover to expand, pin icon to lock open. Lists all registered projects plus Docs, Hub Analytics, and Hub Settings at the bottom.
- **ProjectNavbar** — top bar for the active project: Home, Jobs, Project Analytics, Project Settings.
- **Home** — Specs panel (local tickets) and Rails (execution lanes).
- **Jobs** — all jobs for the active project with real-time log streaming.

---

## Running your first job

1. Select a project in the sidebar.
2. On the Home page, click **+ Add Spec** to create a spec.
3. Drag the spec into a Rail and click **Play** to start the pipeline.

Or from the CLI:

```bash
cd ~/repos/my-app
specrails-hub implement "#42"
```

Monitor the job in **Jobs** — logs stream in real-time.

---

## CLI quick reference

```bash
specrails-hub start                              # Start the hub server
specrails-hub add <path>                         # Register a project
specrails-hub list                               # List registered projects
specrails-hub remove <project-id>               # Unregister a project
specrails-hub implement "#42"                    # Queue an implement job (cwd project)
specrails-hub --project my-app implement "#42"  # Target a specific project by name
```

---

## Next steps

- [Platform Overview](platform-overview.md) — how the hub works
- [Features](../product/features.md) — full feature reference
- [Workflows](../product/workflows.md) — step-by-step guides
