# Operations Runbook

Common operational procedures for running, recovering, and updating specrails-hub. Everything here is verified against the shipped code (v1.63.1). The hub binds to `127.0.0.1` only.

For the full data-directory layout, every CLI flag, env vars, and hub/project settings, see [Configuration](configuration.md).

## Starting the hub

```bash
# Start the hub server (daemonized — it detaches and returns once ready)
specrails-hub start

# Start on a non-default port (the --port flag may appear in any position)
specrails-hub --port 5000 start
```

`start` writes the server PID to `~/.specrails/manager.pid` and appends the server's stdout/stderr to `~/.specrails/hub.log`. The default port is `4200`.

## Stopping the hub

```bash
specrails-hub stop
```

`stop` reads the PID file and sends `SIGTERM`. If the PID file is stale (no such process), it prints `hub is not running (stale pid file)` and removes the file for you — so you rarely need to delete `manager.pid` by hand.

## Status / health check

The first thing to run when something looks wrong:

```bash
# Is the hub up? On what URL/PID? How many projects?
specrails-hub status

# Same, against a custom port
specrails-hub --port 5000 status

# One-line manager status (also usable as a script-friendly probe)
specrails-hub --status
```

`status` prints `hub: running (pid <n>) on http://127.0.0.1:<port>`, the project count, and each project name. It exits non-zero when the hub is not running.

> `specrails-hub --jobs` is **not** functional against the running hub — the server does not expose a cross-project `/api/jobs` route, so the command prints a message that jobs history requires a manager with SQLite persistence and exits `1`. Browse job history per project in the app's **Jobs** page instead.

## Hub data location

All hub data lives under `~/.specrails/` (the path is hardcoded to your home directory — there is no override env var):

```
~/.specrails/
  hub.sqlite        # Hub-level SQLite: project registry + hub_settings
  hub.token         # Auto-generated API token (mode 0600)
  manager.pid       # PID of the running server (removed on a clean stop)
  hub.log           # Server stdout/stderr (appended on each start)
  projects/
    <slug>/
      jobs.sqlite   # Per-project job history, invocations, telemetry pointers
```

See [Configuration](configuration.md#specrails-directory-structure) for the complete per-project subtree (telemetry blobs, explore-cwd, terminals, attachments, etc.) and how the `<slug>` is derived.

> **Auth token caveat.** `~/.specrails/hub.token` gates every `/api/*` request and WebSocket upgrade. Deleting it (or doing a full `rm -rf ~/.specrails`) regenerates a fresh token on the next start, which can leave an already-open browser tab or CLI on the old token — reload the app after a token reset. See [Configuration → Authentication](configuration.md#authentication).

## Log files

The hub already daemonizes and writes its output to `~/.specrails/hub.log` on every `start` — you do not need to redirect anything yourself.

```bash
# Follow the live log
tail -f ~/.specrails/hub.log

# Show the last 200 lines
tail -n 200 ~/.specrails/hub.log
```

The log file is opened in append mode, so it accumulates across restarts. Truncate or rotate it manually if it grows large.

## Backups

To back up all hub data, copy the whole directory while the hub is stopped:

```bash
specrails-hub stop
cp -r ~/.specrails/ ~/specrails-backup-$(date +%Y%m%d)/
```

Your project source code and each project's `.specrails/` folder (specs, profiles, plugins) live in your repos, not here — they are not part of this backup.

## Troubleshooting

### Port already in use

```bash
# Find the process bound to the port (use your custom port if not 4200)
lsof -i :4200

# Stop the hub cleanly
specrails-hub stop

# Last resort: kill by recorded PID
kill "$(cat ~/.specrails/manager.pid)"
```

If you run the hub on a custom port, point `lsof` and `status` at that port (`--port <n>`).

### Hub won't start after a crash

A clean `stop` already clears a stale PID file. If a crash left one behind and `start` still refuses:

```bash
rm ~/.specrails/manager.pid
specrails-hub start
```

### Hub database reset (loses project registrations)

> **Warning:** `hub.sqlite` is the project registry *and* the hub-settings store. Deleting it unregisters **every** project and resets all hub settings. Your project source and each project's specrails-core install are untouched, but you must re-add each project afterward.

```bash
# Back up first, then reset
cp ~/.specrails/hub.sqlite ~/.specrails/hub.sqlite.bak
specrails-hub stop
rm -f ~/.specrails/hub.sqlite*   # the glob also clears the WAL/SHM sidecars
specrails-hub start              # re-creates an empty registry

# Re-register each project
specrails-hub add /path/to/project-a
specrails-hub add /path/to/project-b
```

### Per-project reset (keeps the registration)

To clear one project's job history, invocations, and telemetry pointers while keeping it registered, delete just that project's `jobs.sqlite` with the hub stopped:

```bash
specrails-hub stop
rm -f ~/.specrails/projects/<slug>/jobs.sqlite*
specrails-hub start
```

The `<slug>` matches the project's directory name, lowercased with non-alphanumeric runs collapsed to hyphens (e.g. `My App v2!` → `my-app-v2`). The project's registration in `hub.sqlite` and its on-disk `.specrails/` assets are left intact; the per-project DB is re-created empty on next start.

## Updates

For an npm-installed hub:

```bash
npm update -g specrails-hub
specrails-hub stop && specrails-hub start
```

The desktop app self-updates via Tauri's passive updater — no manual step needed.

## Desktop app

These commands require the **Rust toolchain** and `@tauri-apps/cli` (a devDependency), in addition to a checked-out repo with both `npm install` trees (root + `client/`).

### Development

```bash
npm run dev:desktop
```

Runs `tauri dev` — a hot-reloading desktop window backed by the dev server.

### Production build

```bash
npm run build:desktop
```

This single script chains the full pipeline: `build:server` → client build → `build:sidecar` → `tauri build`. There is **no** `npm run tauri` script — `npm run tauri dev` / `npm run tauri build` fail with `Missing script: tauri`.

The macOS build is signed + notarized. The Windows x64 and arm64 builds ship **unsigned** in v1 (users see a SmartScreen warning → "More info → Run anyway"). See [Windows](../platforms/windows.md) and [macOS](../platforms/macos.md) for platform specifics.

### Build the server sidecar only

```bash
npm run build:sidecar
```

Bundles the Express server (and the `node-pty` native module) into the standalone sidecar that Tauri ships. `build:desktop` runs this for you; run it on its own only when iterating on server code for a desktop build.

### Regenerate app icons

```bash
npm run generate-icons
```

Regenerates every icon size (PNG/ICNS/ICO) from `src-tauri/icons/icon.svg` via `tauri icon`. Requires the Rust toolchain + `@tauri-apps/cli`. Run after any icon design change.

## Further reading

- [Configuration](configuration.md) — full data layout, hub/project settings, auth token, env vars
- [CLI reference](../cli.md) — every command and flag in detail
- [Architecture](architecture.md) — server modules, data flow, WebSocket protocol
- [macOS](../platforms/macos.md) · [Windows](../platforms/windows.md) — platform-specific operations
