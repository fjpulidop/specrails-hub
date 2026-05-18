# CLI reference

The `specrails-hub` CLI does three things:

1. **Manages the hub server** — start, stop, status.
2. **Manages projects** — list, add, remove.
3. **Routes commands into the running hub** — implement specs, run health checks, pass raw prompts to Claude.

Everything here is grouped by what you're trying to do, not by alphabetical order of flags.

## Manage the hub

### Start it

```bash
specrails-hub start
specrails-hub start --port 5000     # custom port (default 4200)
```

The hub daemonises and writes its PID to `~/.specrails/manager.pid`. Logs go to stdout — to capture them:

```bash
specrails-hub start > ~/.specrails/hub.log 2>&1 &
```

If you're using the desktop app, it bundles the server and starts it for you. You don't need `specrails-hub start` at all.

### Stop it

```bash
specrails-hub stop
```

Cleanly shuts down: SIGTERM, 2 s grace, SIGKILL. Removes the PID file.

### See what it's doing

```bash
specrails-hub status                # human-readable
specrails-hub --status              # one-shot, machine-friendly
specrails-hub --jobs                # recent jobs table across all projects
```

## Manage projects

### List

```bash
specrails-hub list
```

Prints every registered project: ID, slug, name, path.

### Add

```bash
specrails-hub add /path/to/your/project
```

Registers the project with the hub. The path must be absolute and must exist. If the project doesn't have specrails-core installed, the next dashboard visit triggers the setup wizard.

### Remove

```bash
specrails-hub remove <project-id>
```

Unregisters the project. Does **not** delete the project directory or its specrails-core installation. To re-register, just `add` it again — job history under `~/.specrails/projects/<slug>/jobs.sqlite` is preserved.

## Run things in the active project

`specrails-hub` auto-detects which project you're in by matching your `cwd` against registered projects' paths (or any parent directory).

### Implement a spec

```bash
cd ~/repos/my-app
specrails-hub implement "#42"
```

This is shorthand for `specrails-hub /specrails:implement "#42"` — the hub queues a rail job that you can monitor in the Dashboard. Token usage and cost are tracked in Analytics.

### Implement a batch

```bash
specrails-hub batch-implement "#40" "#41" "#43"
```

Queues each spec as its own job.

### Health check

```bash
specrails-hub health-check
```

Runs the project's `/specrails:health-check` agent: validates the agent layout, checks for missing baseline trio agents, surfaces stale upstream agents.

### Compatibility check

```bash
specrails-hub compat-check
```

Runs `/specrails:compat-check`: probes the installed specrails-core version against the hub's expectations and reports gaps (e.g. profile support requires ≥ 4.1.0).

### Other known verbs

These are all shorthand for `/specrails:<verb>` — the hub auto-prefixes:

| Verb | What it does |
|------|--------------|
| `implement` | Queue a rail job for one spec |
| `batch-implement` | Queue rail jobs for many specs |
| `why` | Explain why a chunk of code looks the way it does |
| `propose-spec` | Draft a spec proposal from a natural-language description |
| `get-backlog-specs` | Read your product backlog and surface candidate specs |
| `auto-propose-backlog-specs` | Auto-propose specs from the product backlog |
| `refactor-recommender` | Scan the codebase and recommend high-leverage refactors |
| `health-check` | Verify agent layout |
| `compat-check` | Check specrails-core version compatibility |
| `enrich` | Re-run the AI enrichment step for an existing install |

### Pass a raw prompt

Anything that isn't a known verb is forwarded verbatim to `claude` in the project directory:

```bash
specrails-hub "summarise the changes since main"
specrails-hub /opsx:ff
specrails-hub /any:custom:command "with arguments"
```

The hub still tracks cost in Analytics under `surface=job`.

### Target a specific project from anywhere

```bash
specrails-hub --project my-app implement "#42"
specrails-hub --project ~/repos/api-srv batch-implement "#5" "#6"
```

`--project` accepts a project slug, project ID, or absolute path. Use it when you want to launch work in a project from outside its directory (e.g. from a CI runner or your home directory).

## OpenSpec workflow

Bundled `opsx:*` commands for structured change management of the hub itself. Run them from the project directory:

```bash
specrails-hub /opsx:new
specrails-hub /opsx:ff          # fast-forward — create all artifacts in one go
specrails-hub /opsx:apply       # implement the change
specrails-hub /opsx:verify      # reviewer pass
specrails-hub /opsx:archive     # archive to .specrails/changes/archived/
specrails-hub /opsx:sync        # sync delta specs to main specs (no archive)
specrails-hub /opsx:continue    # step through artifact creation one at a time
```

Full lifecycle reference: [internals/openspec-workflow.md](internals/openspec-workflow.md).

## Diagnostic flags

| Flag | What it does |
|------|--------------|
| `--port <n>` | Connect to (or start) the hub on a non-default port |
| `--status` | One-shot status print, machine-friendly |
| `--jobs` | Recent jobs table, machine-friendly |
| `--help`, `-h` | Print usage and exit |

## When the hub isn't running

If you invoke a `specrails-hub` command while the hub is not running, it falls back to invoking `claude` directly (no queue, no tracking). You'll see a `[specrails-hub] hub not running, falling back to direct claude invocation` warning. Start the hub first if you want jobs to appear in the dashboard.

## Where to go next

- [Getting started](getting-started.md) — install and onboard.
- [Running pipelines](running-pipelines.md) — what happens when you `implement`.
- [Internals: API reference](internals/api-reference.md) — what the CLI actually calls.
