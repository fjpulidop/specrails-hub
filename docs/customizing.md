# Customising the hub

Every setting you can change, grouped by where you'll find it.

## Themes

Open **Hub Settings** (gear icon at the bottom of the Arc sidebar) → **Appearance**.

Three built-in themes:

| Theme | Vibe |
|-------|------|
| **Dracula** *(default)* | Dark purple, original specrails palette |
| **Aurora Light** | Light theme, soft pastels |
| **Obsidian Dark** | Dark neutral, high contrast |

The selection is hub-wide (one theme across all projects) and applies instantly:

- All UI components recolour live.
- The terminal panel reconfigures without losing scrollback or shell integration.
- Recharts charts in Analytics recolour live.
- Syntax-highlighted code blocks recolour live.

There's an inline anti-FOUC script in `index.html` so a page refresh never shows a flash of the wrong theme.

The active theme persists to `hub_settings.ui_theme` on the server and mirrors to `localStorage` so the desktop app and browser stay in sync if you use both.

> Want a fourth theme? It's a small contribution — see `client/src/lib/themes.ts` and `internals/architecture.md` for the contract.

## Sidebar pin

The left Arc sidebar has three states:

- **Collapsed** — narrow strip of icons.
- **Hover-expand** — collapses by default, expands on hover.
- **Pinned-open** — always wide.

Cycle through them with the pin icon at the top, or `Cmd+B` / `Ctrl+B`. State is per-machine (local UI preference, not synced).

The right project sidebar (Chat) has a parallel mode toggle with `Cmd+Shift+B` / `Ctrl+Shift+B`.

## Per-project settings

Open **Settings** from the project navbar (top right of any project page).

### Budget

| Setting | Behaviour |
|---------|-----------|
| **Daily budget (USD)** | Hub pauses the queue when the rolling 24-hour spend exceeds this. Blank = no cap. |
| **Per-job alert threshold (USD)** | OS notification when a single job exceeds this. Blank = disabled. |

When the daily budget is hit, you see a banner on the Dashboard. Resume by raising the budget, clearing it, or waiting for the rolling window to slide.

### Telemetry

Opt-in OpenTelemetry capture for rail runs.

| Setting | Behaviour |
|---------|-----------|
| **Enable pipeline telemetry** | Default OFF. When ON, every rail spawn gets OTLP env vars injected. Each rail's traces/metrics/logs are captured to a `.ndjson.gz` blob. |

When telemetry is on, the **Diagnostic ZIP** button appears on every job's detail page. The ZIP contains `job-metadata.json`, `telemetry.ndjson`, `logs.txt`, `summary.md`, and per-job snapshots of the agent profile and active plugins.

Retention: raw blobs > 7 days old are compacted at startup (file deleted, aggregates kept).

Scope: rails only. The sidebar chat, Explore, AI Edit, and the setup wizard are not instrumented.

### Terminal panel

Hot-reload semantics: font family/size, copy-on-select, long-running command threshold, and notify-on-completion apply **live** to existing sessions on save. Render mode, shell integration, and image rendering apply on **the next spawned session**.

| Setting | Default | What it does |
|---------|---------|--------------|
| Font family | `Menlo`, `Monaco`, `monospace` | Terminal font |
| Font size | 13 px | Cmd+= / Cmd+- live-zooms within a session |
| Copy on select | off | Auto-copy when text is selected |
| Render mode | auto | `auto` picks WebGL when available; falls back to canvas on context loss |
| Shell integration | on | Inject OSC 133 / 1337 shim per shell |
| Image rendering | on | Decode Sixel + iTerm2 inline images (`@xterm/addon-image`) |
| Long-running command threshold | 60 s | Trigger a notification after this duration |
| Notify on completion when unfocused | on | Emits a desktop notification when a long-running command finishes and the window isn't focused |

Project overrides win per-field; missing fields fall back to hub defaults; missing hub defaults fall back to built-ins.

See [docs/terminal.md](terminal.md) for the full reference of keyboard shortcuts and shell integration.

## Hub-wide settings

Open **Hub Settings** from the Arc sidebar.

### Appearance

- **Theme** — see above.

### Default Claude model

The model used for all pipeline jobs unless a project or profile overrides. Default: `claude-sonnet-4-6`.

### Terminal panel defaults

Same fields as the per-project terminal settings. These are the hub-wide defaults; per-project values override them.

### Authentication token

Optional bearer token to protect the hub API. Default: none (single-user local tool).

> Important: the hub binds to `127.0.0.1`. Even without a token, it's not exposed to your network. Setting a token only adds a second line of defence (e.g. for shared dev machines).

## Environment variables

Most settings live in the UI. A few hub-level switches are env-only because they're guardrails ops people want to flip without opening the dashboard:

### Server-side (read at hub startup or by spawned children)

| Variable | Effect |
|----------|--------|
| `SPECRAILS_DIR` | Override `~/.specrails/` data directory location |
| `SPECRAILS_CORE_BIN` | Override the path to the `specrails-core` binary (default: `npx specrails-core`) |
| `SPECRAILS_TECH_URL` | Override the `specrails-tech` proxy URL |
| `SPECRAILS_AGENTS_SECTION=false` | Hide the Agents tab from every project |
| `SPECRAILS_PLUGINS_SECTION=false` | Hide the Integrations tab from every project |
| `SPECRAILS_TERMINAL_PANEL=false` | Disable the bottom terminal panel everywhere |
| `SPECRAILS_SMASH=0` | Disable SMASH spec decomposition (server returns 409 on the endpoints) |
| `SPECRAILS_EXPLORE_CONTRACT_REFINE=0` | Hub-wide kill switch for Contract Refine (auto-fire + retry endpoint) |
| `SPECRAILS_EXPLORE_LEGACY_CWD=1` | Force Explore spawns to use the project root instead of the hub-managed `explore-cwd/` |
| `SPECRAILS_ALLOW_LOCAL_WEBHOOKS=1` | Allow webhooks to target loopback / private network addresses |
| `NODE_ENV=production` | Production server behaviour |

### Client-side (Vite — set at build time)

| Variable | Effect |
|----------|--------|
| `VITE_FEATURE_TERMINAL_PANEL=true` | Surface the bottom terminal panel |
| `VITE_FEATURE_AGENTS_SECTION=true` | Surface the Agents tab in the project navbar |
| `VITE_FEATURE_EXPLORE_REVIEW=true` | Enable the Review step in the Explore shell |
| `VITE_FEATURE_EXPLORE_PREMIUM_UX=false` | Disable the "Conectando…/Pensando…/Consultando código…" pills above the Explore streaming bubble |

> **Port:** the hub doesn't read an env var for its port — use the `--port <n>` flag on `specrails-hub start` instead.

Set them in the shell that launches the hub. Desktop app users can set them in their shell rc files since the desktop app inherits the launchd PATH and env.

## Resetting the hub

To wipe all hub state (project registry, settings, theme) but keep your project source code intact:

```bash
specrails-hub stop
rm -rf ~/.specrails/hub.sqlite ~/.specrails/projects/
specrails-hub start
```

This deletes the project registry and every per-project SQLite. Your project directories on disk and their `.specrails/` folders (specs, profiles, plugins) are untouched.

For a more surgical reset (e.g. clear job history for one project but keep the registration), see [internals/operations-runbook.md](internals/operations-runbook.md).

## Backup

Everything the hub knows is in `~/.specrails/`. Back it up:

```bash
tar -czf specrails-backup-$(date +%F).tar.gz -C ~ .specrails
```

Restore by extracting the archive in `~/`.

Per-project specs, profiles, and plugins live in your project directories (`<project>/.specrails/`), so they ride along with `git`.

## Where to go next

- [Tracking cost](tracking-cost.md) — set a daily budget so you can stop checking the bill.
- [Terminal panel](terminal.md) — fine-tune the bottom panel.
- [Operations runbook](internals/operations-runbook.md) — port conflicts, stale PID files, recovery procedures.
