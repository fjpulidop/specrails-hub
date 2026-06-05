# Delta Spec: bundle-runtimes-desktop

This file records the normative changes this feature makes to the project's living specification (CLAUDE.md). Each section below maps to the CLAUDE.md section it amends.

---

## Section: GUI-launch PATH resolution (`server/path-resolver.ts`)

### Current text (excerpt)

> At startup the server runs `resolveStartupPath()` (sync) to prepend missing well-known package-manager directories (`/opt/homebrew/{bin,sbin}`, `/usr/local/{bin,sbin}` on macOS; `/usr/local/{bin,sbin}`, `~/.local/bin` on Linux; no-op on Windows). Right after `app.listen` it kicks off `augmentPathFromLoginShell()` (async, 1500ms timeout) to merge any additional segments from the user's `$SHELL -l -i` rc files.

### Amended text

> At startup the server runs `resolveStartupPath()` (sync).
>
> **Desktop mode** (`SPECRAILS_IS_DESKTOP=1`): prepends the bundled Node and Git bin directories from `SPECRAILS_BUNDLED_RUNTIMES_PATH` as the first PATH entries. Homebrew and other fast-path directories are NOT prepended in desktop mode. `augmentPathFromLoginShell()` is a no-op in desktop mode — the login-shell merge must not run because it could prepend system tool dirs ahead of bundled ones.
>
> **Non-desktop mode** (CLI server, `npm run dev:server`): behavior is unchanged — prepends well-known package-manager directories (`/opt/homebrew/{bin,sbin}`, `/usr/local/{bin,sbin}` on macOS; `/usr/local/{bin,sbin}`, `~/.local/bin` on Linux; no-op on Windows). Kicks off `augmentPathFromLoginShell()` (async, 1500ms timeout) after `app.listen`.
>
> `resolveBundledRuntimePath() => string` is a new export that returns `SPECRAILS_BUNDLED_RUNTIMES_PATH`. Throws if called outside desktop mode or if the env var is missing.
>
> `PathSource` gains a new literal `'bundled'` — appears in diagnostic responses when bundled runtime dirs are prepended.
>
> `GET /api/hub/setup-prerequisites?diagnostic=1` response: `pathSources` may now include `'bundled'`.

---

## Section: Developer prerequisites gate

### Current text (excerpt)

> `AddProjectDialog` and `SetupWizard` both render `<PrerequisitesPanel />` driven by the shared `usePrerequisites()` hook (60s in-memory cache, recheck on `window.focus`, manual recheck via the install-instructions modal). The hook fetches `GET /api/hub/setup-prerequisites`... `AddProjectDialog` disables its submit while any required tool is missing, surfaces a "More info" link only when the panel is in the missing state, and opens `<InstallInstructionsModal />` with OS-aware install commands...

### Amended text

> In **non-desktop mode**, behavior is unchanged.
>
> In **desktop mode** (`SPECRAILS_IS_DESKTOP=1`), the prerequisites check is a bundle health check:
> - `getSetupPrerequisitesStatus()` probes bundled binary absolute paths directly instead of using `which`.
> - A `--version` failure returns `{ bundled: true, error: 'corrupted-bundle' }` on the affected tool entry.
> - `PrerequisitesPanel` in desktop mode suppresses the "More info" link and `InstallInstructionsModal`. Instead it renders "Bundle corrupted — reinstall the SpecRails Hub app." when `error === 'corrupted-bundle'`.
> - On a healthy install, all bundled tools report `installed: true, executable: true, bundled: true` immediately — no user action required.
>
> **New fields on `SetupPrerequisite`** (additive, optional, desktop-mode only):
> - `bundled?: true` — present when this tool is provided by the bundled runtime.
> - `error?: 'corrupted-bundle'` — present when the bundled binary fails its `--version` probe.

---

## Section: Desktop packaging (`scripts/build-sidecar.mjs`)

### Addition

> **Bundled runtimes layout** (new subsection):
>
> CI downloads Node.js 22 LTS and Git into `src-tauri/runtimes/` before `tauri build`. Versions are pinned via `NODE_BUNDLE_VERSION` and `GIT_BUNDLE_VERSION` CI env vars. Checksums are verified against the official SHASUMS256.txt (Node) and release SHA files (Git) before extraction. Tauri copies `src-tauri/runtimes/**/*` into the app bundle via the `bundle.resources` entry in `tauri.conf.json`.
>
> **macOS arm64 layout** (inside app bundle):
> ```
> Contents/Resources/runtimes/
>   node/bin/{node, npm, npx}
>   node/lib/node_modules/npm/
>   git/bin/git
>   git/lib/
>   git/share/
> ```
>
> **Windows x64 layout** (inside app bundle):
> ```
> resources/runtimes/
>   node/{node.exe, npm.cmd, npx.cmd, node_modules/npm/}
>   git/cmd/git.exe
>   git/usr/bin/
>   git/mingw64/
> ```
>
> The Tauri host (`src-tauri/src/lib.rs`) sets `SPECRAILS_IS_DESKTOP=1` and `SPECRAILS_BUNDLED_RUNTIMES_PATH=<abs-path-to-runtimes-dir>` on the sidecar env before spawn.

---

## Section: Release pipeline (desktop-release.yml)

### Addition

> **Runtime download steps** (new subsection):
>
> Both `build-macos` and `build-windows` jobs gain:
> 1. A "Download and verify Node.js (macOS arm64 / Windows x64)" step: downloads from nodejs.org official releases, verifies SHA256 against `SHASUMS256.txt`, extracts to `src-tauri/runtimes/node/`.
> 2. A "Download and verify Git (macOS arm64 / Windows x64)" step: downloads from git-scm.com (macOS) or git-for-windows/git releases (Windows portable), verifies checksum, extracts to `src-tauri/runtimes/git/`.
> 3. A "Smoke test bundled Node.js and Git" step: strips system Node and Git from runner PATH, then calls `<bundled-node> --version`, `<bundled-npm> --version`, `<bundled-npx> --version`, and `<bundled-git> --version`. Job fails if any exits non-zero.
>
> `NODE_BUNDLE_VERSION` and `GIT_BUNDLE_VERSION` are workflow-level env vars that pin the major version series for each runtime. The exact patch version is resolved at build time against the official release index.

---

## New Capability

### `bundled-runtimes` (new)

> **Desktop mode bundles Node.js 22 LTS and Git inside the Tauri app.** Activated exclusively when `SPECRAILS_IS_DESKTOP=1`.
>
> - **Sidecar**: bundled runtimes directory is always first in `process.env.PATH`. System Node/Git are never selected.
> - **Prerequisite check**: bundle health check only. Failure surfaces "Bundle corrupted — reinstall app". No OS install instructions.
> - **Scope**: macOS arm64 and Windows x64 only. Linux desktop and Windows arm64 are out of scope.
> - **Non-goal**: Claude CLI is not bundled. Users must install it separately.
> - **Non-goal**: no fallback to system Node/Git. Bundled always wins.
> - **Non-goal**: no auto-update of bundled runtimes between app releases.

---

## Env Vars Contract

| Var | Set by | Used by | Value |
|-----|--------|---------|-------|
| `SPECRAILS_IS_DESKTOP` | `src-tauri/src/lib.rs` before sidecar spawn | `path-resolver.ts`, `setup-prerequisites.ts` | `'1'` in desktop app; unset elsewhere |
| `SPECRAILS_BUNDLED_RUNTIMES_PATH` | `src-tauri/src/lib.rs` before sidecar spawn | `path-resolver.ts` (`resolveBundledRuntimePath()`), `setup-prerequisites.ts` | Absolute path to `runtimes/` dir inside app bundle |
| `NODE_BUNDLE_VERSION` | `.github/workflows/desktop-release.yml` (`env:` block) | Download steps in `build-macos` and `build-windows` | e.g. `'22.x'` |
| `GIT_BUNDLE_VERSION` | `.github/workflows/desktop-release.yml` (`env:` block) | Download steps in `build-macos` and `build-windows` | e.g. `'2.49.0'` |
