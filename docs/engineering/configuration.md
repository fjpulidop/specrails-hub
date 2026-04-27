# Configuration

Reference for all configuration options in specrails-hub: hub-level settings, project-level settings, environment variables, CLI flags, and the data directory structure.

---

## Hub settings

Hub settings apply globally across all projects. Access them from the dashboard via the gear icon (⚙) in the top navigation → **Hub Settings**.

| Setting | Description | Default |
|---------|-------------|---------|
| Claude model | The Claude model used for all pipeline jobs | `claude-sonnet-4-6` |
| Authentication token | Optional bearer token to protect the hub API | (none) |
| Max concurrent jobs | How many jobs can run in parallel across all projects | 4 |
| Job timeout | Maximum duration for a single job before it is killed | 30 minutes |
| Port | The port the hub server listens on | 4200 |

Hub settings are persisted in `~/.specrails/hub.sqlite`.

---

## Project settings

Project settings apply to one project and are accessible via the project's **Settings** tab in the dashboard (route: `/settings`).

| Setting | Description |
|---------|-------------|
| Name | Display name shown in the project switcher |
| Path | Absolute path to the project directory (read-only after registration) |
| Claude model override | Use a different model for this project only |

---

## CLI flags

All CLI flags can be combined with any command.

### Global flags

| Flag | Description | Default |
|------|-------------|---------|
| `--port <n>` | Connect to (or start) the hub on port `<n>` | `4200` |
| `--help`, `-h` | Print usage and exit | — |

### Hub management commands

```bash
specrails-hub start                  # Start the hub server (daemonized)
specrails-hub stop                   # Stop the hub server
specrails-hub status                 # Show hub status and all registered projects
specrails-hub add <path>             # Register a project by absolute path
specrails-hub remove <project-id>    # Unregister a project by ID
specrails-hub list                   # List all registered projects
```

### Diagnostic flags

```bash
specrails-hub --status               # Print hub status and exit
specrails-hub --jobs                 # Print recent job history table and exit
```

### Execution commands

```bash
specrails-hub implement "#42"        # Run /sr:implement #42 via the hub
specrails-hub batch-implement #40 #41 #43  # Run batch implementation
specrails-hub "any raw prompt"       # Pass a raw prompt directly to Claude
specrails-hub /sr:health-check       # Pass any slash command directly
```

**Known verbs** (automatically prefixed with `/sr:`):

- `implement`
- `batch-implement`
- `why`
- `product-backlog`
- `update-product-driven-backlog`
- `refactor-recommender`
- `health-check`
- `compat-check`

Any other input is passed as a raw prompt.

### Port override example

```bash
# Start on a custom port
specrails-hub --port 5000 start

# Run a command against that port
specrails-hub --port 5000 implement "#42"
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required by Claude CLI for API access |
| `SPECRAILS_PORT` | Default port override (alternative to `--port`) |
| `NODE_ENV` | Set to `production` for optimized server behavior |

---

## `~/.specrails/` directory structure

```
~/.specrails/
  hub.sqlite              # Hub-level SQLite: project registry + hub settings
  manager.pid             # PID of the running specrails-hub server process
  hub.log                 # Server stdout/stderr (appended on each start)
  projects/
    <project-slug>/
      jobs.sqlite         # Per-project job history, token usage, and logs
```

**Slug generation:** The project slug is derived from the directory name by converting to lowercase and replacing non-alphanumeric characters with hyphens. Example: `my-app-v2` → `my-app-v2`, `My App` → `my-app`.

**Backup:** To back up all specrails-hub data, copy `~/.specrails/`. The project source code itself is not stored here.

**Reset:** To fully reset specrails-hub (remove all project registrations and job history):

```bash
specrails-hub stop
rm -rf ~/.specrails/hub.sqlite ~/.specrails/projects/
```

This does not affect your project source code or specrails-core installations.

---

## Further reading

- [Getting Started](../general/getting-started.md) — installation guide
- [Platform Overview](../general/platform-overview.md) — architecture and data flow
- [Workflows](workflows.md) — step-by-step task guides
