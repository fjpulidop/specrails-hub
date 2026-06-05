## Why

The specrails-hub desktop app (Tauri) currently requires users to have Node.js (>=18 LTS), npm, npx, and Git pre-installed and discoverable on PATH before the setup wizard can succeed. This is a consistent onboarding failure point for non-developer users — the target audience for the desktop distribution. Symptom: user downloads the `.dmg` or `.exe`, launches the app, clicks "Add Project", and immediately hits a red prerequisites panel listing missing tools they have never heard of.

The friction is structural: the hub's sidecar server delegates `resolveStartupPath()` and `augmentPathFromLoginShell()` to discover tools from the host OS at runtime. On a clean macOS arm64 or Windows x64 machine with no development tools, those helpers find nothing.

Bundling pre-built Node.js 22 LTS and Git binaries directly inside the Tauri app eliminates this class of failure completely. The desktop sidecar always resolves to the bundled binaries by prepending their directories to `process.env.PATH` at startup — no OS install required. The prerequisite check UI becomes a bundle health check instead of an install guide.

## What Changes

- **NEW** `resolveBundledRuntimePath()` function in `server/path-resolver.ts`: resolves the absolute path to the bundled runtimes directory from the `SPECRAILS_BUNDLED_RUNTIMES_PATH` env var set by Tauri before sidecar spawn.

- **MODIFIED** `resolveStartupPath()` in `server/path-resolver.ts`: when `SPECRAILS_IS_DESKTOP=1`, unconditionally prepends the bundled Node and Git bin dirs as the first entries in `process.env.PATH`. The existing homebrew/fast-path prepend logic is skipped in desktop mode.

- **MODIFIED** `augmentPathFromLoginShell()` in `server/path-resolver.ts`: becomes a no-op when `SPECRAILS_IS_DESKTOP=1`. Login-shell augmentation is irrelevant and potentially harmful when bundled runtimes must always win.

- **MODIFIED** `server/setup-prerequisites.ts`: desktop-mode branch. When `SPECRAILS_IS_DESKTOP=1`, `getSetupPrerequisitesStatus()` probes bundled binary paths directly instead of running `which node` / `which git` against the system PATH. A `--version` failure maps to `error: 'corrupted-bundle'` — the UI surfaces "Bundle corrupted — reinstall app" and never renders OS install instructions.

- **MODIFIED** `src-tauri/src/lib.rs`: sets `SPECRAILS_IS_DESKTOP=1` and `SPECRAILS_BUNDLED_RUNTIMES_PATH=<abs>` env vars on the sidecar command before spawn. The existing macOS login-shell PATH override is retained for locating Claude CLI (which is NOT bundled).

- **MODIFIED** `src-tauri/tauri.conf.json`: adds `runtimes/**/*` entries under `bundle.resources` so Tauri copies the downloaded binaries into the correct platform-specific layout inside the app bundle.

- **MODIFIED** `.github/workflows/desktop-release.yml`: adds runtime download and checksum-verification steps to `build-macos` and `build-windows` jobs; adds a post-build smoke test step that strips system Node and Git from the runner's PATH and verifies the bundled binaries respond to `--version`.

## Capabilities

### New Capabilities

- `bundled-runtimes`: desktop mode bundles Node.js 22 LTS and Git inside the Tauri app. Sidecar always uses bundled binaries. Prerequisite check UI is a bundle health check in this mode.

### Modified Capabilities

- `gui-launch-path-resolution`: `resolveStartupPath()` and `augmentPathFromLoginShell()` are gated on `!SPECRAILS_IS_DESKTOP`. Desktop mode bypasses both and substitutes the bundled runtimes prepend. Non-desktop (CLI server) mode unchanged.
- `developer-prerequisites-gate`: `getSetupPrerequisitesStatus()` gains a desktop-mode code path. `PrerequisiteCheckResult` gains `bundled: true` and `error: 'corrupted-bundle'` fields used exclusively in that path. Non-desktop mode unchanged.

## Constraints & Non-Goals

- **No Claude CLI bundling.** The Claude binary is a user-owned credential carrier; bundling it raises licensing and size concerns. Users must have Claude installed.
- **No fallback to system Node/Git.** When `SPECRAILS_IS_DESKTOP=1`, bundled always wins. Mixed resolution (bundled node, system git) creates a version-mismatch support surface.
- **No auto-update of bundled runtimes.** Runtime updates ship with new app releases. There is no separate runtime update channel.
- **macOS arm64 and Windows x64 only in this change.** Linux desktop and Windows arm64 bundling are deferred.
- **No npm registry mirroring.** `npx specrails-core@latest` fetches from the public npm registry using the bundled `npx`. Network connectivity is still required for wizard execution.
- **No bundling of specrails-core itself.** Core is always fetched fresh via npx.
- **App size increase**: ~60–80 MB per platform is acceptable for the onboarding quality gain.

## Success Criteria

- Fresh macOS arm64 install with no pre-existing Node or Git: wizard completes successfully end to end.
- Fresh Windows x64 install with no pre-existing Node or Git: wizard completes successfully end to end.
- `resolveBundledRuntimePath()` exported from `server/path-resolver.ts`, returns correct abs path when `SPECRAILS_IS_DESKTOP=1`.
- `resolveStartupPath()` prepends bundled runtimes bin dirs first; `which node` and `which git` inside any spawned subprocess resolve to bundled paths.
- `augmentPathFromLoginShell()` is a no-op when `SPECRAILS_IS_DESKTOP=1`.
- Prerequisite check UI in desktop mode shows "Bundle corrupted — reinstall app" when a bundled binary fails `--version`; never shows OS install instructions.
- All-green prerequisites immediately on a healthy install with no user action required.
- CI smoke test strips system Node/Git from runner PATH and verifies bundled binaries exit 0 on `--version`; job fails if either exits non-zero.
- CI downloads Node 22 LTS and Git for both platforms with checksum verification before Tauri build.
- Node version pinned via `NODE_BUNDLE_VERSION` CI env var.
- Non-desktop CLI/server mode prerequisites and path-resolver behaviour unaffected.
