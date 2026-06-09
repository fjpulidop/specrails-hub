# Configuration

Reference for configuring specrails-hub: hub-wide settings, per-project settings, the authentication token, environment variables, CLI flags, and the `~/.specrails/` data directory.

Everything here is verified against the shipped code (v1.63.1). The hub server binds to `127.0.0.1` only and rejects any non-localhost origin, so all of this is local-first by design.

---

## Authentication

The hub is protected by a **mandatory** API token — there is no "off" switch and no UI to set it.

- On first run the server generates a token (two concatenated random UUIDs) and writes it to `~/.specrails/hub.token` with mode `0600`. The same file is reused on every subsequent start.
- Every `/api/*` route requires the token via an `Authorization: Bearer <token>` or `X-Hub-Token: <token>` header. The only exceptions are `GET /api/health` and `GET /api/hub/token`.
- WebSocket upgrades carry the token as the `hub-token.<token>` subprotocol.
- The browser client fetches the token same-origin from `GET /api/hub/token`, so you never type it in.

Two more layers keep the hub local-only:

- **Loopback bind** — the server listens on `127.0.0.1` exclusively (`server.listen(port, '127.0.0.1')`).
- **CORS allow-list** — only `localhost`, `127.0.0.1`, `tauri.localhost`, and `tauri://localhost` origins are accepted; anything else gets a `403`.

To rotate the token, stop the hub, delete `~/.specrails/hub.token`, and start again — a fresh token is generated.

---

## Hub settings

Hub settings apply across all projects. Open them from the **left sidebar → Settings**, or via the Command Palette (`Cmd/Ctrl+K`) → **Hub Settings**. They are persisted in `~/.specrails/hub.sqlite` under the `hub_settings` key/value table.

The Global Settings page is organised into these sections:

| Section | What it controls | Stored key / default |
|---------|------------------|----------------------|
| **Appearance** | Hub-wide UI theme. Five built-ins: `specrails` (default), `dracula`, `aurora-light`, `obsidian-dark`, `matrix`. | `ui_theme` = `specrails` |
| **specrails-tech** | Base URL for the external specrails-tech agents service. | `specrails_tech_url` = `http://localhost:3000` (the `SPECRAILS_TECH_URL` env var is only a fallback when this setting is unset — the stored setting wins) |
| **Budget & Alerts** | Hub-wide daily spend cap (queues auto-pause when exceeded) and a per-job cost alert threshold. | `hub_daily_budget_usd`, `cost_alert_threshold_usd` (both unset by default = no cap / no alert) |
| **OS Notifications** | Desktop notification preferences for long-running jobs and budget events. | — |
| **Outbound Webhooks** | HTTP webhooks fired on `job.completed`, `job.failed`, `job.canceled`, `daily_budget_exceeded`, and `hub_daily_budget_exceeded`. | webhooks table (defaults to `["job.completed","job.failed"]` per hook) |
| **Code section** | Plain-language file-summary language (`en` / `es`) and the monthly summary budget cap. | `summary_language` = `en`, `summary_monthly_budget_usd` = `5.00` |
| **Terminal Panel** | Hub-wide defaults for the integrated terminal (font, render mode, copy-on-select, shell integration, image rendering, long-command threshold). | `terminal.*` keys |

> There is **no** "Claude model", "Max concurrent jobs", "Job timeout", or "Authentication token" hub setting. Within a project, jobs run one at a time (see [Architecture](architecture.md)); the only automatic queue pause is budget-based. The default model is the provider adapter's default (the `sonnet` alias for Claude), resolved at spawn time — it is not a stored setting.

**Port is not a live setting.** `hub_settings` does store a `port` value, but it is display-only. The port the server actually binds is taken from the `--port` argv (default `4200`); changing the stored value does not rebind a running server. Set the port with `--port <n>` on `specrails-hub start`.

---

## Project settings

Project settings apply to a single project. Open them from the project's **Settings** entry in the right sidebar (route: `/settings`). The page is titled **Project Settings** and has these sections:

| Section | What it controls |
|---------|------------------|
| **Pipeline Telemetry** | Opt-in toggle that injects OpenTelemetry env vars into pipeline job spawns so they emit OTLP signals back to the hub. Off by default. |
| **Rail Pre-prompt** | Text prepended to every rail launch for this project. |
| **Ultracode pre-prompt** | Text prepended to Ultracode-mode launches (the Claude-only autonomous rail mode). |
| **Budget** | Per-project daily spend cap (with queue auto-pause) and a per-job cost alert threshold. |
| **Terminal Settings** | Per-project overrides for the terminal panel defaults (project override → hub default → built-in). |

> The project's **provider(s)** (Claude, Codex, or both) are chosen when you add the project and are **immutable after creation** — there is no provider switch in Project Settings. There is also **no** Name edit, Path row, or model-override field on this page.

---

## CLI

The `specrails-hub` CLI is documented in full in [../cli.md](../cli.md). Quick reference:

### Global flags

These can appear in any position and are stripped before the command runs.

| Flag | Description | Default |
|------|-------------|---------|
| `--port <n>` | Connect to (or start) the hub on port `<n>` | `4200` |
| `--project <name\|path>` | Target a specific registered project (by name or path) | auto-detect from `cwd` |
| `--version`, `-v` | Print the CLI version and exit | — |
| `--help`, `-h` | Print usage and exit | — |
| `--status` | Print hub status and exit | — |

> Project auto-detection is an **exact canonical-path match** (`realpathSync(cwd)` compared against registered project paths). It does **not** walk up parent directories — running from a subdirectory of a registered project will not match. Use `--project` to target a project from anywhere.

### Hub management

```bash
specrails-hub start                  # Start the hub server (daemonized)
specrails-hub stop                   # Stop the hub server
specrails-hub list                   # List all registered projects
specrails-hub add <path>             # Register a project by absolute path
specrails-hub remove <project-id>    # Unregister a project by ID
```

### Running work

```bash
specrails-hub implement "#42"                  # Queue /specrails:implement for spec #42
specrails-hub batch-implement "#40" "#41" "#43"  # Queue one batch job over several specs
specrails-hub "any raw prompt"                 # Pass a raw prompt straight to the AI CLI
specrails-hub /specrails:health-check          # Pass any slash command directly
```

> **Always quote issue refs.** An unquoted `#` starts a shell comment, so `batch-implement #40 #41` silently drops the refs. Quote each one: `"#40" "#41"`.

**Known verbs** (automatically prefixed with `/specrails:`): `implement`, `batch-implement`, `why`, `get-backlog-specs`, `auto-propose-backlog-specs`, `propose-spec`, `refactor-recommender`, `health-check`, `compat-check`, `enrich`. Any other first argument is passed as a raw prompt.

### Port override example

```bash
specrails-hub --port 5000 start
specrails-hub --port 5000 implement "#42"
```

---

## Environment variables

A few env vars are read directly by the hub. The two most useful operational ones:

| Variable | Description |
|----------|-------------|
| `SPECRAILS_TECH_URL` | Fallback specrails-tech base URL. Resolution order is the `specrails_tech_url` hub setting **first**, then this env var, then `http://localhost:3000` — so a stored hub setting takes precedence over this var. |
| `WM_ZOMBIE_TIMEOUT_MS` | Zombie-job detection timeout in milliseconds (default `1800000` = 30 min). This is a stuck-job watchdog, **not** a hard "kill after N minutes" cap. |

`ANTHROPIC_API_KEY` is **not** read by the hub. The Claude CLI authenticates on its own — via a Claude subscription login or its own API-key configuration — so you do not set it for the hub.

For the full catalogue of feature flags and kill switches (`SPECRAILS_*` server gates, `VITE_FEATURE_*` client flags, `SPECRAILS_HUB_CODEX_BETA`, `SPECRAILS_EXPLORE_*`), see [../customizing.md](../customizing.md#environment-variables).

---

## `~/.specrails/` directory structure

```
~/.specrails/
  hub.sqlite              # Hub-level SQLite: project registry + hub_settings
  hub.token               # Auto-generated API token (mode 0600)
  manager.pid             # PID of the running specrails-hub server process
  hub.log                 # Server stdout/stderr (appended on each start)
  projects/
    <project-slug>/
      jobs.sqlite         # Per-project job history, invocations, telemetry pointers
      jobs/<jobId>/       # Per-job snapshots (profile.json, plugins.json) — chmod 400
      telemetry/          # OTEL blobs (<jobId>.ndjson.gz) when telemetry is on
      explore-cwd/        # Hub-managed cwd for Explore Spec turns
      terminals/          # Per-session shell-integration shim dirs
      codex-home/         # Per-project CODEX_HOME (Codex projects only)
      browser-profile/    # Persistent browser-capture profile
      attachments/        # Spec attachments, keyed by ticket
      user-mcp.json       # Materialised user-approved MCP config (chmod 600)
```

**Slug generation.** The slug is derived from the project directory name: lowercased, every run of non-alphanumeric characters collapsed to a single hyphen, and leading/trailing hyphens stripped. Example: `My App v2!` → `my-app-v2`.

**Backup.** To back up all hub data, copy `~/.specrails/`. Your project source code lives in your repos, not here.

**Reset.** To clear project registrations and job history:

```bash
specrails-hub stop
rm -rf ~/.specrails/hub.sqlite ~/.specrails/projects/
```

> This leaves `hub.token`, `manager.pid`, and `hub.log` in place. For a full wipe (including the API token), `rm -rf ~/.specrails`. Either way, your project source and specrails-core installations are untouched.

---

## Further reading

- [Getting started](../getting-started.md) — user-facing install guide
- [Architecture](architecture.md) — server modules, data flow, WebSocket protocol
- [CLI reference](../cli.md) — every command and flag in detail
- [Customising the hub](../customizing.md) — feature flags, env vars, keybindings
- [Adding a provider](adding-a-provider.md) — wiring a third AI CLI adapter
