# Operations Runbook

This runbook covers common operational procedures for specrails-hub.

## Starting the Hub

```bash
# Start the hub server
specrails-hub start

# Start with a specific port
specrails-hub start --port 4200

# Check if hub is running
specrails-hub status
```

## Stopping the Hub

```bash
specrails-hub stop
```

## Hub Data Location

All hub data is stored in `~/.specrails/`:

```
~/.specrails/
  hub.sqlite        # Project registry
  manager.pid       # Server PID (deleted on stop)
  projects/
    <slug>/
      jobs.sqlite   # Per-project job history
  docs/             # Documentation files
```

## Troubleshooting

### Port already in use

```bash
# Find the process using port 4200
lsof -i :4200

# Force kill the hub
specrails-hub stop
# or
kill $(cat ~/.specrails/manager.pid)
```

### Hub won't start after crash

```bash
# Remove stale PID file
rm ~/.specrails/manager.pid

# Start fresh
specrails-hub start
```

### Database corruption

```bash
# Back up and reset the hub database
cp ~/.specrails/hub.sqlite ~/.specrails/hub.sqlite.bak
rm ~/.specrails/hub.sqlite
specrails-hub start  # Re-creates the database
```

## Log Files

The hub writes logs to stdout. To capture logs:

```bash
specrails-hub start > ~/.specrails/hub.log 2>&1 &
```

## Updates

```bash
npm update -g specrails-hub
specrails-hub stop && specrails-hub start
```

## Desktop App

### Development

```bash
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

### Regenerate icons

```bash
node scripts/generate-icons.mjs
```

Regenerates all icon sizes from the source SVG. Run after any icon design change.

### Build server sidecar

```bash
node scripts/build-sidecar.mjs
```

Compiles the Express server to a standalone binary for bundling inside the Tauri app. Run before `npm run tauri build` if server code has changed.
