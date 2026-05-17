# Running pipelines

You have specs on the board. Now let's ship them. This guide covers everything from launching a single rail to wiring agent profiles and plugins.

## The big picture

```
SpecsBoard (left)            Rails (right)
─────────────────            ─────────────────
#1 Login flow      ─┐
#2 Webhook retry    │  drag onto
#3 Cost limits      │ ────────────►   Rail 1
#4 Audit log        │                 ▶ Play
                    │
                    └────────────►   Rail 2
                                     ▶ Play

                     Each rail runs Architect → Developer → Reviewer → Ship
                     using the Claude CLI in your project directory.
```

A **rail** is an execution lane. Drag a spec onto a rail and press **▶ Play** to launch the AI pipeline. Each rail runs independently — you can have two rails working on different specs in parallel, with different agent profiles.

## Rails

Each rail has a header with:

- **Status pill** — `idle`, `running`, `completed`, `failed`.
- **Spec list** — the IDs of the specs assigned to this rail. Drag in more, drag out to detach.
- **Mode toggle** — one-shot (run the first spec only) or batch (run all assigned specs sequentially).
- **Profile picker** — which agent profile this rail will use. Defaults to the project's `default` profile if one exists; "No profile" = legacy mode.
- **Play / Stop button** — start or cancel.

### Pipeline phases

By default each rail runs four phases in sequence:

```
Architect ──► Developer ──► Reviewer ──► Ship
```

Each phase is a specialised Claude Code agent invoked in your project's working directory:

| Phase | Agent | What it does |
|-------|-------|--------------|
| Architect | `sr-architect` | Plans the implementation |
| Developer | `sr-developer` | Writes the code |
| Reviewer | `sr-reviewer` | Reviews the output |
| Ship | (varies) | Final wrap-up: tests, commit, PR draft |

The exact agent for each phase is determined by your project's agent profile. The baseline trio (`sr-architect`, `sr-developer`, `sr-reviewer`) is mandatory; routing rules in the profile can fan-out or override.

### Running multiple rails

Different rails can run **simultaneously** within the same project. They share the same Claude API account but are otherwise independent processes. Different projects' rails run in parallel without constraint.

Within a single project, *jobs* (rail runs) for the same rail are serialised — Rail 1 finishes before Rail 1 starts again. Across rails, parallelism is bounded by your global "Max concurrent jobs" setting (default: 4).

## Jobs

Every rail run becomes a **Job**. Find them under the **Jobs** tab in the project navbar.

### Jobs page

A table of every job for the active project. Columns:

- Status, command, duration, cost, exit code, started-at, profile badge.
- Filter by status, search by command, sort by any column.
- Click a row to open the **Job Detail page**.

### Job Detail page

Two purpose-built components above the streaming log:

- **`JobStatusPanel`** — header with status icon, live duration ticker, and an incremental counter for turns + tokens + cost (derived from streaming `assistant` events). Cost shows `—` until the authoritative `total_cost_usd` arrives at job exit.
- **`JobTicketHeader`** — chips for every ticket the job touched (resolved by parsing the `command` and matching against the spec board). Click a chip to open the spec's detail modal over the job page without changing the route. `+N more` collapse mode at ≥ 4 tickets.

Below: the full streaming log with auto-scroll, search, and copy.

### Cancelling a job

Click **Stop** on the rail header. The hub sends SIGTERM to the Claude subprocess with a 2 s grace, then SIGKILL.

### Diagnostic ZIP export

Visible iff [telemetry](customizing.md#telemetry) was enabled for this job. Click **Export diagnostic ZIP** in the Job Detail header. Contains:

- `job-metadata.json` — command, status, profile, plugins
- `telemetry.ndjson` — uncompressed OTLP/JSON
- `logs.txt` — full streaming log
- `summary.md` — human-readable highlights
- `profile.json`, `plugins.json` — exact snapshots of what ran

## Agent profiles

A **profile** is a named JSON file that bundles orchestrator + agent chain + per-agent models + routing rules. Different rails can run different profiles.

### Why use profiles

Without profiles, every rail uses the project's frontmatter-baked models. With profiles, you can:

- Have a `default` profile for everyday work (Sonnet across the board).
- A `budget` profile that swaps Developer to Haiku and routes simple tasks away from Architect.
- A `max` profile for high-stakes work with Opus + every optional agent.

### Browse / create profiles

Open the **Agents** tab in the project navbar. Two sub-tabs:

- **Profiles** — full CRUD over `.specrails/profiles/*.json`. The live validator enforces the baseline trio and routing ordering — Save is disabled with a "N issues to resolve" hint while you're broken.
- **Agents Catalog** — read-only viewer of upstream `sr-*` agents and your `custom-*` agents.

Empty state offers **Migrate from current agents**: one click creates a `default` profile mirroring today's frontmatter.

Each profile gets a per-profile analytics card showing usage for the last 7 / 30 / 90 days: jobs, success rate, avg tokens, avg duration.

### Pick a profile at launch

Three places to pick:

- **Implement Wizard** (one spec) — footer dropdown, preselected to the project default.
- **Batch Implement Wizard** (multiple specs) — batch-level picker + a per-feature override table when you have > 1 issue selected.
- **Dashboard rails** — compact dropdown in each rail header. Pick once; it persists across launches of that rail.

The **"No profile"** option always exists — use it to run a rail exactly as it did pre-4.1.0.

### Custom agents (Agent Studio)

From the Agents Catalog tab, click **Create New** to open the Agent Studio. Four creation modes:

| Mode | Behaviour |
|------|-----------|
| Template | Pick from Security Reviewer, Data Engineer, Performance Profiler, UI/UX Polisher |
| Generate | Describe the agent in natural language; Claude drafts the full `.md` |
| Blank | Start from a minimal template |
| Duplicate | Copy any existing agent (upstream or custom) |

Custom agents live at `.claude/agents/custom-*.md` and are **never touched** by specrails-core's installer/update scripts. Every save appends a version row — open **History** in the Studio to browse and restore.

Click **Test** in the Studio to run the current draft against a sample task in an isolated `claude` invocation — no files written, output + token count + duration shown inline.

### Requirements

Profiles require `specrails-core ≥ 4.1.0` in the project. Without it, you can still create and edit profiles in the hub, but the pipeline runs in legacy mode (no env injection). A yellow banner on the Agents page tells you when you need to upgrade.

For deeper internals (resolution order, snapshotting, file format), see [internals/profiles.md](internals/profiles.md).

## Plugins

Per-project bundled integrations. Click **Integrations** in the project navbar.

### Bundled today

- **Serena** — semantic code navigation via LSP + MCP. Requires `uv` on PATH (the hub auto-detects).

### Installing a plugin

Each plugin tile has:

- **Status** — `not installed`, `installed`, `orphan` (state file mentions it but `.mcp.json` doesn't), `degraded` (verify failed).
- **Preview install** — shows which `mcpServers` entries and agent fragments will land where, so you can sanity-check before clicking.
- **Install** — applies the changes. Progress streams over the WebSocket (`plugin.install_progress` event).
- **Uninstall** — removes the surgical changes; never wholesale rewrites your `.mcp.json`.
- **Health** — on-demand verify (probes a `--version`-style command with a 2 s timeout).

### How plugins affect your pipeline

Before each rail spawn, the hub:

1. Resolves the project's installed plugins (parallel verify, per-plugin 2 s timeout).
2. Classifies them into `active` and `degraded`.
3. Writes a per-job snapshot to `~/.specrails/projects/<slug>/jobs/<jobId>/plugins.json` (chmod 400).
4. Injects two env vars into the Claude subprocess: `SPECRAILS_PLUGINS_ACTIVE` (CSV) and `SPECRAILS_PLUGINS_SNAPSHOT` (file path).

Degraded plugins are **non-blocking** — the rail spawns anyway, but a `plugin.degraded` toast surfaces in the UI.

### Reserved paths

The hub never wholesale rewrites these files:

- `<project>/.mcp.json` — surgical merge per plugin.
- `<project>/.specrails/plugins/state.json` — install registry.
- `<project>/.specrails/plugins/snapshots/<jobId>.json` — per-job snapshots.
- `<project>/.claude/agents/custom-<plugin>.md` — optional fragment per plugin.

specrails-core's installer also guarantees it never touches `.specrails/plugins/**` or `.claude/agents/custom-*.md`.

## Spec launcher (batch)

For when you have a list of specs and want them all running:

1. On the Dashboard, click **Launch many** at the top of the SpecsBoard.
2. Select specs via checkbox.
3. Pick a batch-level profile and (optionally) override per spec.
4. Hit **Launch**.

The hub assigns specs to rails round-robin and starts them. You can monitor everything in the Jobs page.

## Stopping everything

If something looks wrong:

- **One rail** — Stop button on the rail header.
- **All rails in the active project** — Pause queue in Project Settings (queues new jobs but lets in-flight ones complete) or kill the hub: `specrails-hub stop`.
- **Everything** — Quit the desktop app, or `specrails-hub stop`.

## Where to go next

- [Tracking cost](tracking-cost.md) — see what each rail run is costing you.
- [Customising the hub](customizing.md) — daily budget, per-job alerts, telemetry.
- [Agents Studio internals](internals/profiles.md) — for power users.
