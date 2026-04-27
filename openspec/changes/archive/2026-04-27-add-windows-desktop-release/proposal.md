## Why

specrails-hub currently ships only as a macOS Apple Silicon `.dmg`. A non-trivial share of prospective users run Windows and cannot install the hub today. Shipping a Windows x64 desktop build — even unsigned for v1 — unblocks that audience and gets real-world feedback before investing in code-signing infrastructure.

This change adds a Windows x64 build path to the existing desktop-release pipeline without changing the macOS flow and without taking on code-signing costs yet (addressed later as a follow-up change).

## What Changes

- Add a `build-windows` job to `.github/workflows/desktop-release.yml` running on `windows-latest`. It produces a Tauri-bundled Windows installer (NSIS `.exe` and MSI) that embeds the `specrails-server` sidecar compiled for `x86_64-pc-windows-msvc`.
- `scripts/build-sidecar.mjs` already contains the pkg target mapping for Windows — exercise and validate it on a Windows runner.
- Extend `deploy` to download both macOS and Windows artifacts and upload both to `downloads/specrails-hub/v<version>/` and `downloads/specrails-hub/latest/`.
- Extend `manifest.json` published to `latest/` with a `windows-x64` platform entry (filename, url, sha256, size) alongside the existing `darwin-arm64`. The ordering guarantee is strengthened: *all* binaries must be uploaded before `manifest.json`.
- Publish Windows installer filename following a version-bearing pattern (`specrails-hub-<version>-x64-setup.exe` for NSIS, `specrails-hub-<version>-x64.msi` for MSI).
- **No code signing** for v1 — the installer will trigger Windows SmartScreen warnings. This is explicit and accepted.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `desktop-release-channel`: manifest gains multi-platform support (`windows-x64` added), filename regex scenario expanded for Windows artifacts, upload ordering rule generalized across all platform binaries.

## Impact

- **CI:** `.github/workflows/desktop-release.yml` — new `build-windows` job, updated `deploy` job dependencies and upload matrix.
- **Build scripts:** `scripts/build-sidecar.mjs` exercised on Windows runner; confirm pkg target resolution, native addon copy (better-sqlite3, node-pty with ConPTY/winpty files) works end-to-end. `process.dlopen` and `Module._resolveFilename` patches in `server/index.ts` need validation on win32.
- **Tauri config:** no changes expected; `bundle.targets: "all"` already emits NSIS + MSI on Windows. `icon.ico` already listed.
- **Release artifacts:** new `.exe` and `.msi` published under `latest/` and `v<version>/`. `manifest.json` schema additive change (non-breaking for consumers that tolerate unknown keys; specrails-web consumer will surface a Windows download CTA in a follow-up).
- **Out of scope (explicit):** code signing (Authenticode), ARM64 Windows, Tauri auto-updater, installer polish (Start Menu group, custom uninstaller UI), Windows tray integration.
