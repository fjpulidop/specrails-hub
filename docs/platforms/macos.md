# macOS notes

## GUI launch and PATH resolution

When SpecRails Hub is launched from `Applications/` (Finder, Dock, Spotlight) the embedded server inherits the **launchd** `PATH`, not the interactive shell `PATH`. On Apple Silicon Macs this typically means `/opt/homebrew/bin` is missing. The server compensates at startup:

1. **Fast path (sync)** — `resolveStartupPath()` in `server/path-resolver.ts` prepends any missing well-known package-manager directories to `process.env.PATH`:
   - `/opt/homebrew/bin`, `/opt/homebrew/sbin` (Apple Silicon brew prefix)
   - `/usr/local/bin`, `/usr/local/sbin` (Intel brew prefix and macOS `.pkg` installer destination)

   Existing entries in the inherited PATH keep their original order; the fast path only fills gaps.

2. **Login-shell merge (async)** — right after the HTTP server starts listening, `augmentPathFromLoginShell()` spawns `$SHELL -l -i` once with a 1500 ms timeout to recover any segments contributed by your shell rc files (`.zshrc`, `.bashrc`, `~/.config/fish/config.fish` if `$SHELL` is fish-compatible). This is the path Volta, nvm, fnm, asdf, etc. add to `PATH` only inside the user's interactive shell. On timeout or non-zero exit, the fast-path PATH stays in effect and a single warning is logged.

The resolved `PATH` is stored on `process.env.PATH` so every downstream spawn inherits it (`QueueManager` → `claude` CLI, `SetupManager` → `npx specrails-core`, `terminalManager` PTYs, etc.).

## Broken-symlink detection

If `which node` succeeds but `node --version` fails (typical with stale `/usr/local/bin/node` symlinks left by an old installer pointing at a deleted `Cellar` target), the prerequisites response sets:

- `installed: true`
- `executable: false`
- `meetsMinimum: false`
- `installHint`: "found at `<path>` but failed to execute — possibly a broken symlink. Reinstall the tool or remove the stale link at `<path>`."

The UI shows a clearer message than the previous "unknown found — needs 18.0.0+" wording, which used to send users in circles reinstalling Node.

## Diagnostic endpoint

`GET /api/hub/setup-prerequisites?diagnostic=1` returns the standard payload plus a `diagnostic` block:

```jsonc
{
  "diagnostic": {
    "pathSegments": ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/bin"],
    "pathSources": ["fast-path", "fast-path", "fast-path", "fast-path", "inherited", "inherited"],
    "loginShellStatus": "ok",       // "ok" | "skipped" | "timeout" | "error"
    "whichResults": { "node": "/opt/homebrew/bin/node", "npm": "/opt/homebrew/bin/npm", "npx": "/opt/homebrew/bin/npx", "git": "/usr/bin/git" },
    "nodeEnv": "production",
    "platform": "darwin"
  }
}
```

The install-instructions modal exposes a **Copy diagnostics** button that fetches this endpoint and copies the JSON to the clipboard for bug reports.

The base endpoint (no `?diagnostic=1`) does not include the `diagnostic` field — payload size for the regular UI poll stays small.

## Verifying manually

After installing or reinstalling Node:

1. Quit SpecRails Hub completely (Cmd-Q, not just close window).
2. Relaunch from `Applications/`.
3. Open the `Add Project` dialog.
4. All four rows (Node.js, npm, npx, Git) should be green with a version number.

If Node is still flagged red, click **More info → Copy diagnostics** and inspect `whichResults.node` and `pathSegments` to see whether the resolver found the binary you expect.
