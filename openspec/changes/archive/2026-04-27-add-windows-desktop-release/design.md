## Context

The current `desktop-release.yml` workflow builds a signed + notarized macOS `.dmg` on `macos-latest` and uploads it to Hostinger via FTP under two paths (`v<version>/` and `latest/`), accompanied by a `manifest.json` that specrails-web reads to render the Download CTA.

The sidecar build system (`scripts/build-sidecar.mjs`, `@yao-pkg/pkg`) already maps `x86_64-pc-windows-msvc → node22-win-x64`, and Tauri is configured with `bundle.targets: "all"` plus `icons/icon.ico`. The missing pieces are exclusively CI/CD, runtime validation on Windows, and the manifest schema extension.

Two runtime patches in `server/index.ts` anchor native addon loading for the pkg-packaged sidecar (`Module._resolveFilename`/`_load` redirect + `process.dlopen` override). These were written with a win32 code path but never executed in CI. The terminal subsystem already branches on `win32` to spawn `powershell.exe -NoLogo` and to switch PTY backends, so no runtime code changes are expected — only validation.

Prior OpenSpec `server-sidecar` spec envisions `x86_64-pc-windows-msvc` as a supported build target ("Build sidecar script runs successfully" scenario enumerates macOS arm64, macOS x64, **Windows x64**), but the CI matrix never exercised that branch. This change closes the gap between spec and reality.

## Goals / Non-Goals

**Goals:**
- A tag push `v*` produces both a macOS `.dmg` (existing) and a Windows x64 installer (new), without breaking the macOS pipeline.
- The Windows installer (NSIS `.exe` and MSI, per Tauri's default Windows bundle set) embeds a functional sidecar that can start the Express server, serve the React client, and run the agent/terminal features end-to-end on Windows 10/11.
- `manifest.json` published to `latest/` lists both `darwin-arm64` and `windows-x64` platforms with correct `filename`, `url`, `sha256`, and `size`.
- The FTP deploy step enforces "all binaries uploaded before manifest" so consumers never see a manifest referencing a not-yet-published file.

**Non-Goals:**
- Code signing (Authenticode) — deferred to a follow-up change. The v1 installer WILL trigger SmartScreen warnings and this is accepted and documented.
- Auto-updater via Tauri updater framework.
- ARM64 Windows (`aarch64-pc-windows-msvc`).
- Windows-specific installer polish (custom UI, Start Menu grouping, uninstaller branding, tray integration).
- specrails-web consumer changes — tracked separately; this change only publishes the manifest entry.

## Decisions

### Decision 1: Separate `build-windows` job, not a matrix strategy

**Choice:** Add a second top-level job `build-windows: runs-on: windows-latest` rather than converting `build-macos` into a `strategy.matrix` over OSes.

**Rationale:** The jobs diverge heavily on secrets (Apple certificate, API key, signing identity vs. nothing on Windows v1) and build steps (notarization is macOS-only). A matrix forces conditional `if:` guards on almost every step, which is more brittle and less readable than two parallel jobs with a shared `deploy` consumer.

**Alternatives considered:**
- `strategy.matrix: [macos-latest, windows-latest]` — rejected for the reason above.
- Build Windows on a self-hosted runner — rejected, no infra.

### Decision 2: Bundle both NSIS and MSI (Tauri default)

**Choice:** Leave `tauri.conf.json` at `bundle.targets: "all"` and publish both the NSIS `.exe` installer and the MSI to `latest/`/`v<version>/`.

**Rationale:** NSIS is the recommended, smaller, consumer-friendly default; MSI is required by enterprise users with group-policy deployment. The Tauri build emits both in the same step for free. The manifest's `windows-x64` entry points to the NSIS `.exe` (consumer default); the MSI is discoverable via the versioned folder listing.

**Alternatives considered:**
- NSIS-only — rejected; forecloses enterprise adoption with no build-time cost to include MSI.
- MSI-only — rejected; NSIS is a better OSS first-contact experience.

### Decision 3: Filename convention `specrails-hub-<version>-x64-setup.exe` and `specrails-hub-<version>-x64.msi`

**Choice:** Mirror the macOS pattern (`specrails-hub-<version>-aarch64.dmg`) with a Windows-appropriate arch suffix.

**Rationale:** Version-bearing filenames let consumers parse the version without the manifest, and `x64` is the conventional Windows arch tag (not `x86_64` which is a Linux/Rust convention).

**Alternatives considered:**
- `specrails-hub-setup.exe` (no version) — rejected; breaks the "filename contains semver" requirement already present in the `desktop-release-channel` spec.
- `specrails-hub-<version>.exe` (no arch) — rejected; cannot distinguish future ARM64 build.

### Decision 4: Tauri installer renaming

**Choice:** Tauri does not natively expose filename templating for NSIS/MSI outputs; they are emitted with fixed patterns (`SpecRails Hub_<version>_x64-setup.exe`, `SpecRails Hub_<version>_x64_en-US.msi`). The `build-windows` job SHALL rename these to the convention in Decision 3 before upload, matching the existing `macos` rename step where applicable.

**Rationale:** Filename convention must survive regardless of Tauri's default output naming. A post-build rename step is a well-scoped one-liner per artifact.

### Decision 5: Sidecar build runs on the Windows runner (no cross-compile)

**Choice:** `npm ci` + `npm run build:sidecar` run on `windows-latest` itself so native prebuilds (`better-sqlite3`, `node-pty`) resolve to their win32 prebuilt `.node` files.

**Rationale:** pkg's JS-level cross-compile is real, but native `.node` addons must come from an install on the target platform. Cross-compiling Windows from macOS/Linux would require manually fetching prebuilds and is brittle. Running the same script as macOS on a win32 runner is the simplest path.

**Open risk:** `@yao-pkg/pkg` Windows target has known signing-related quirks (Authenticode sections). Unsigned builds should be unaffected; validate empirically.

### Decision 6: Manifest schema evolution is additive

**Choice:** Keep `schemaVersion: 1`. Adding `windows-x64` under `platforms` is an additive change — existing consumers already iterate `platforms` or lookup `platforms['darwin-arm64']` and ignore unknown keys.

**Rationale:** Bumping to `schemaVersion: 2` would force every consumer to update before a Windows release could ship. The manifest spec already documents `platforms` as an open map; this is the exact extension point it was designed for.

**Alternatives considered:**
- Bump `schemaVersion` to 2 — rejected; unnecessary and breaks forward-compat.

### Decision 7: Upload ordering — all binaries before manifest

**Choice:** Strengthen the existing "manifest after binary" rule to "manifest after *all* binaries referenced by the manifest". The deploy job uploads every `.dmg`/`.exe`/`.msi` first, HEAD-verifies each, then uploads `manifest.json` last.

**Rationale:** A consumer reading the new manifest and requesting the Windows `.exe` must never hit a 404.

## Risks / Trade-offs

- **SmartScreen scares users** → Mitigation: publish a short doc/blog on the download page ("Windows users: when the SmartScreen prompt appears, click *More info → Run anyway*"). Track install funnel drop-off once telemetry exists. Treat as a known limitation for v1.
- **Sidecar dlopen patch may fail silently on win32** → Mitigation: smoke-test the produced `.exe` in CI before uploading. Launch the installer in a headless session, wait for `GET http://localhost:4200/api/hub/state` to return 200, then exit. Block the release if the smoke test fails.
- **node-pty Windows backend (ConPTY) resource files** → Mitigation: verify the `binaries/node-pty/**/*` glob picks up win32-specific files (no `spawn-helper`, yes `conpty.node` or `winpty-agent.exe` depending on node-pty version). Confirm via `tauri build --debug` output listing bundled resources.
- **Custom titlebar parity** → Non-blocker for this change (shipping works), but cosmetic polish (Windows min/max/close affordance order, snap-layouts support on Win11) is not covered here. Open bug for follow-up if it looks wrong on first run.
- **CI minutes cost** → Windows runners cost 2× macOS on GitHub Actions free tier. Releases are rare (tagged); impact negligible.
- **Hostinger FTP reliability under parallel uploads** → Mitigation: upload sequentially within the single `deploy` job, HEAD-verify each before proceeding.

## Migration Plan

The web consumer (specrails-web) will NOT render a Windows download CTA at ship time of this change. This means publishing a broken Windows binary to prod `latest/` has zero user-visible impact until specrails-web is explicitly updated to surface the `windows-x64` manifest entry. That property collapses what would normally be a multi-step staging dance into a single prod release.

1. Merge the PR to `main`.
2. Let release-please produce its Release PR (version bump + changelog entry).
3. Merge the Release PR. The auto-created tag `v<version>` triggers `Desktop Release`, which builds macOS and Windows in parallel and uploads both to `downloads/specrails-hub/latest/` and `downloads/specrails-hub/v<version>/` with the combined `manifest.json`.
4. Download the Windows `.exe` from `https://specrails.dev/downloads/specrails-hub/latest/` onto a clean Windows 10/11 VM. Install, smoke-test: hub starts, add a project, terminal spawns PowerShell, one agent job runs to completion.
5. Update specrails-web to read `platforms["windows-x64"]` and surface the Windows CTA only after the smoke test passes.

**Rollback:** If the Windows build ships broken, hotfix the workflow to re-upload a `manifest.json` with only `darwin-arm64` under `platforms`. The broken `.exe` can stay in `latest/` harmlessly — no consumer references it while specrails-web has no Windows CTA. No impact on macOS users.

## Open Questions

- **Does the pkg Windows target need `--no-bytecode`?** Some reports of codegen issues on recent Node versions. First run will reveal.
- **Does `node-pty`'s Windows build require additional Visual C++ runtime on the target machine?** ConPTY is shipped with Windows 10 1809+, so no — but confirm on a freshly installed Windows 11.
- **MSI publisher attribute (unsigned)** — Tauri lets us set a display name but not a verified publisher without a cert. Confirm the MSI doesn't fail to install due to missing publisher; if it does, may need to disable MSI for v1.
- **File extension in `manifest.platforms['windows-x64'].filename`** — point to NSIS `.exe` or allow both? Proposal: NSIS `.exe` only, with the MSI reachable via the version-folder directory listing.
