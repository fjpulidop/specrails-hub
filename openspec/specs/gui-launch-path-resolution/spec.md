# gui-launch-path-resolution Specification

## Purpose
Resolve the inherited launchd PATH at server startup so the embedded hub finds Homebrew/Volta/nvm-installed `node`, `npx`, and `git` even when launched from Finder/Dock instead of a terminal, and surface diagnostics so users can troubleshoot broken installs.

## Requirements

### Requirement: Server augments PATH at startup with well-known package-manager directories

When the hub server process starts on macOS or Linux, it SHALL prepend missing well-known package-manager bin directories to `process.env.PATH` before any router, manager, or prerequisites check runs. The augmentation SHALL be a no-op on Windows (`process.platform === 'win32'`).

The well-known directories SHALL be, in priority order:

- macOS: `/opt/homebrew/bin`, `/opt/homebrew/sbin`, `/usr/local/bin`, `/usr/local/sbin`.
- Linux: `/usr/local/bin`, `/usr/local/sbin`, `~/.local/bin`.

A directory SHALL only be prepended if it is not already present in the inherited `PATH`. Existing entries SHALL retain their original order.

#### Scenario: GUI launch on Apple Silicon Mac with brew node
- **WHEN** the server starts with inherited `PATH=/usr/bin:/bin:/usr/sbin:/sbin`
- **AND** the platform is `darwin`
- **THEN** `process.env.PATH` after `resolveStartupPath()` SHALL begin with `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:`
- **AND** the original entries SHALL follow in their original order

#### Scenario: Terminal launch with full PATH
- **WHEN** the server starts with inherited `PATH` that already contains `/opt/homebrew/bin` and `/usr/local/bin`
- **THEN** `process.env.PATH` after `resolveStartupPath()` SHALL be unchanged (no duplicate entries)

#### Scenario: Windows is no-op
- **WHEN** the server starts on `process.platform === 'win32'`
- **THEN** `resolveStartupPath()` SHALL return without mutating `process.env.PATH`

### Requirement: Server merges login-shell PATH asynchronously after listening

After the HTTP server begins listening, the hub SHALL spawn the user's login shell once to recover any PATH segments contributed by shell rc files (Volta, nvm, fnm, asdf shims, custom additions). The merge SHALL run asynchronously and MUST NOT delay the listening socket.

The login-shell command SHALL be `$SHELL -lic 'printf "__SRH_PATH_BEGIN__%s__SRH_PATH_END__" "$PATH"'`. If `$SHELL` is unset, the implementation SHALL fall back to `/bin/sh`.

The spawn SHALL have a hard timeout of 1500 milliseconds. On timeout, error, or non-zero exit, the existing `process.env.PATH` (post fast-path augmentation) SHALL remain in effect and a single warning SHALL be logged.

On success, the implementation SHALL parse the PATH between the sentinel markers and prepend any segments not already present in `process.env.PATH`.

#### Scenario: Login shell adds Volta shim directory
- **WHEN** the user's `.zshrc` exports `PATH="$HOME/.volta/bin:$PATH"`
- **AND** `process.env.PATH` after fast-path resolution does not contain `~/.volta/bin`
- **THEN** after `augmentPathFromLoginShell()` resolves, `process.env.PATH` SHALL contain `~/.volta/bin` (expanded) before the original entries

#### Scenario: Login shell times out
- **WHEN** the login shell does not produce sentinel-bounded output within 1500ms
- **THEN** the spawn SHALL be killed
- **AND** `process.env.PATH` SHALL remain at its post-fast-path value
- **AND** a warning SHALL be logged exactly once

#### Scenario: Login shell prints rc-file noise
- **WHEN** the login shell stdout contains rc-file output before and after the sentinel block (motd, asdf warnings, etc.)
- **THEN** the parser SHALL extract only the content between `__SRH_PATH_BEGIN__` and `__SRH_PATH_END__`
- **AND** the noise SHALL NOT be incorporated into `process.env.PATH`

#### Scenario: Test environment skips login-shell spawn
- **WHEN** `process.env.NODE_ENV === 'test'` or `process.env.VITEST === 'true'`
- **THEN** `augmentPathFromLoginShell()` SHALL return immediately without spawning a shell

### Requirement: Prerequisite detection distinguishes installed from executable

The setup-prerequisites response SHALL include a per-tool `executable` boolean. `executable` SHALL be `true` only when the tool is on `PATH` AND running `<tool> --version` exits with status 0 within the 5-second timeout.

When `installed` is `true` but `executable` is `false`, the response SHALL surface a distinct human-readable hint indicating that the binary at the resolved path failed to execute and suggesting a broken symlink or missing dynamic library.

The `meetsMinimum` field SHALL only be `true` when both `installed` AND `executable` are `true` AND the parsed version meets the minimum.

#### Scenario: Broken symlink at /usr/local/bin/node
- **WHEN** `which node` returns `/usr/local/bin/node`
- **AND** that path is a symlink to a non-existent target
- **AND** `node --version` exits with non-zero status
- **THEN** the response prerequisite for `node` SHALL have `installed: true`, `executable: false`, `meetsMinimum: false`
- **AND** the `installHint` SHALL reference the failed-to-execute case (e.g. mention "broken symlink")

#### Scenario: Healthy node install
- **WHEN** `which node` returns `/opt/homebrew/bin/node` and `node --version` outputs `v22.10.0`
- **THEN** the response prerequisite for `node` SHALL have `installed: true`, `executable: true`, `meetsMinimum: true`, `version: 'v22.10.0'`

#### Scenario: Tool not on PATH at all
- **WHEN** `which git` returns non-zero
- **THEN** the response prerequisite for `git` SHALL have `installed: false`, `executable: false`, `meetsMinimum: false`
- **AND** the `installHint` SHALL be the existing "not on PATH" message, not the broken-symlink message

### Requirement: Diagnostic mode exposes PATH resolution sources

The endpoint `GET /api/hub/setup-prerequisites?diagnostic=1` SHALL return the standard prerequisites payload extended with a `diagnostic` object containing:

- `pathSegments`: the ordered list of `process.env.PATH` entries.
- `pathSources`: a parallel array labelling each entry as one of `'inherited'`, `'fast-path'`, `'login-shell'`.
- `loginShellStatus`: one of `'ok'`, `'skipped'`, `'timeout'`, `'error'`.
- `whichResults`: a per-tool record of the absolute path returned by `which`, or `null` if not found.
- `nodeEnv`: the value of `process.env.NODE_ENV` at request time.
- `platform`: the same platform string as the base response.

The base endpoint (without `?diagnostic=1`) SHALL NOT include the `diagnostic` field.

#### Scenario: Default endpoint omits diagnostic
- **WHEN** the client sends `GET /api/hub/setup-prerequisites`
- **THEN** the response body SHALL NOT contain a `diagnostic` field

#### Scenario: Diagnostic endpoint includes path sources
- **WHEN** the client sends `GET /api/hub/setup-prerequisites?diagnostic=1`
- **AND** `process.env.PATH` was assembled from inherited entries plus `/opt/homebrew/bin` from fast-path
- **THEN** the response `diagnostic.pathSegments` SHALL list every PATH entry in order
- **AND** the corresponding `diagnostic.pathSources` entry for `/opt/homebrew/bin` SHALL be `'fast-path'`

#### Scenario: Diagnostic reports login-shell timeout
- **WHEN** `augmentPathFromLoginShell()` previously timed out
- **AND** the client requests the diagnostic endpoint
- **THEN** `diagnostic.loginShellStatus` SHALL be `'timeout'`

### Requirement: All server-spawned child processes inherit the augmented PATH

`QueueManager`, `ChatManager`, `SetupManager`, and `terminalManager` spawn calls SHALL read from `process.env.PATH` (directly or via inheritance) so that any PATH augmentation performed at startup is visible to the spawned `claude`, `npx`, `git`, and shell processes.

This requirement is satisfied implicitly when the modules continue to use the default `env` inheritance (Node.js spawns inherit `process.env` when no `env` is passed). The requirement exists to lock in that behaviour so future refactors do not silently regress it.

#### Scenario: QueueManager spawn inherits augmented PATH
- **WHEN** `process.env.PATH` has been augmented at startup to include `/opt/homebrew/bin`
- **AND** `QueueManager` spawns the `claude` CLI for a job
- **THEN** the spawned process's `PATH` environment variable SHALL contain `/opt/homebrew/bin`

#### Scenario: SetupManager npx specrails-core finds Apple Silicon node
- **WHEN** the setup wizard runs `npx specrails-core` after PATH augmentation
- **AND** the user's only working node is at `/opt/homebrew/bin/node`
- **THEN** the npx invocation SHALL succeed (i.e. node resolves) without requiring the user to launch the app from a terminal
