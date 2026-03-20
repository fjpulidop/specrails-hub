# Features

A reference guide to every feature available in the specrails-hub dashboard.

---

## Dashboard

**Route:** `/` (project home)

The Dashboard is the real-time view of what is happening in a project right now.

**What you see:**

- **Pipeline phase indicator** — shows which phase (Architect / Developer / Reviewer / Ship) is currently active, with a visual state for each: idle, running, done, or failed
- **Active job card** — when a job is running, the card displays the command, elapsed time, and a live log stream
- **Phase history** — recent phase transitions for the current session
- **Quick actions** — buttons to start common commands: New Change, Implement, Batch

The Dashboard resets its "live" state on project switch but retains the last known phase state until a new job starts.

---

## Analytics

**Route:** `/analytics`

The Analytics tab gives you a quantitative view of AI pipeline activity over time.

**Metrics available:**

| Metric | Description |
|--------|-------------|
| Total jobs | Count of all completed jobs |
| Success rate | Percentage of jobs that exited with code 0 |
| Total tokens | Sum of input + output tokens across all jobs |
| Total cost | Estimated cost in USD based on Claude pricing |
| Avg duration | Mean job duration in seconds |
| Throughput | Jobs completed per day over the selected period |

**Filters:** Select a time range (last 7 days, 30 days, all time) and optionally filter by command type.

Charts display token usage and cost trends over time, making it easy to spot expensive or long-running phases.

---

## Activity Feed

**Route:** `/activity`

A chronological log of every pipeline event in the project — not just the current session.

**Event types:**

- Job started / completed / failed
- Phase transitions (Architect started, Developer completed, etc.)
- Setup wizard events (installation started, completed)
- Project settings changes

Each event entry includes a timestamp, event type, and a brief description. Click any job event to jump to its full log in the Jobs tab.

---

## Chat

**Location:** Sidebar panel in the project layout

A persistent Claude conversation scoped to the active project. Claude has the project directory as its working context.

**Key behaviors:**
- Conversation history persists across dashboard sessions
- Each project has its own independent chat history
- Slash commands trigger pipeline actions directly from chat (see [Workflows](workflows.md#4-use-the-chat-panel) for the full command list)
- The chat panel is always visible in the project sidebar — no navigation needed

**Use the chat to:**
- Ask Claude to explain a part of the codebase
- Request a quick analysis without creating a full Change
- Run diagnostic commands (`/sr:health-check`, `/sr:why`)
- Plan a feature before starting an OpenSpec workflow

---

## Notification Center

**Location:** Bell icon in the top navigation bar

The Notification Center shows alerts for events that require attention or that completed while you were away.

**Notification types:**

| Type | Trigger |
|------|---------|
| Job completed | A job finished successfully |
| Job failed | A job exited with a non-zero code |
| Phase blocked | A pipeline phase stalled and needs review |
| Setup complete | Project setup wizard finished |

Notifications are per-project. Switching projects shows notifications for that project only. Mark all as read with the "Clear all" button.

---

## Feature Funnel

**Route:** `/funnel`

A visual representation of how features move through the pipeline phases over time.

**What it shows:**
- How many changes are in each stage: New → In Progress → In Review → Done
- Conversion rates between stages (e.g., what percentage of started changes reach Done)
- Average time spent in each phase

Use the Funnel to identify where changes are getting stuck — for example, if many changes are stuck in Review, that signals the Reviewer phase needs attention or the specs need more detail.

---

## Jobs

**Route:** `/jobs`

The Jobs tab is the historical record of every Claude invocation for the project.

**Per-job information:**

| Field | Description |
|-------|-------------|
| ID | Short job ID (first 8 chars of UUID) |
| Command | The command that was run |
| Started | Date and time the job was spawned |
| Duration | Total wall-clock time |
| Exit code | 0 = success, non-zero = failure |
| Tokens | Total input + output tokens |
| Cost | Estimated USD cost |

Click any job row to expand the full log output for that job.

From the CLI, you can also view recent jobs:

```bash
specrails-hub --jobs
```

---

## Multi-project navigation

**Location:** Project switcher in the top navigation bar

specrails-hub manages all your projects from one server. Switch between projects using the project dropdown at the top of the page.

**On project switch:**
- All tabs reload data for the new project
- The chat panel switches to the new project's conversation
- Previously loaded data is cached — switching back is instant
- The dashboard URL updates to reflect the active project, so you can bookmark specific project views

---

## Project setup wizard

Activated automatically when adding a project that does not have specrails-core installed.

**Phases:**

1. **Path confirmation** — verify the project directory
2. **Installation proposal** — the hub shows what will be installed and asks for confirmation
3. **Installation** — runs `npx specrails-core` with a live log stream
4. **Setup chat** — a `/setup` conversation with Claude configures the project for your codebase
5. **Completion** — summary of what was set up; the project is now ready

You can also trigger the wizard manually by removing specrails-core from a project and re-adding it via the dashboard.
