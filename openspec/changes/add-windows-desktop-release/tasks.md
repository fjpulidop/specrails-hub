## 1. Sidecar build validation on Windows (validated in-branch)

Validated empirically during dogfood on Windows 11 ARM64 + via the `build-windows` CI matrix. Each bug found was fixed on this branch.

- [x] 1.1 Run `scripts/build-sidecar.mjs` on `windows-latest` — emits `specrails-server-x86_64-pc-windows-msvc.exe`. *(Fixed tar-on-Windows absolute-path bug in commit `5b18c7b` by passing a relative tarball name to tar + using `cwd` in execSync.)*
- [x] 1.2 Sidecar binary launches, Express server binds 127.0.0.1:4200, `/api/hub/state` returns 200. *(Verified on Windows 11 ARM64 under Prism emulation.)*
- [x] 1.3 `better_sqlite3.node` is copied + loads without `ERR_DLOPEN_FAILED`. *(Fixed path resolution in `server/index.ts` pkg-native-addon hijack at commit `886b114` — probes `<exec>/binaries`, `<exec>/../Resources/binaries`, `<exec>` and picks the first containing the anchor file.)*
- [x] 1.4 `node-pty` resources (`conpty.node`, `pty.node`, `winpty-agent.exe`) land under `<install>/binaries/node-pty/` and load on the Node Prism-emulated x64 runtime.
- [x] 1.5 `server/index.ts` patches (`Module._resolveFilename`/`_load`, `process.dlopen`) pass on win32 — the resources-dir probe added in 1.3 covers both macOS `.app` and Windows installs in a single cross-platform guard.

## 2. Tauri Windows installer build (validated on Windows 11 ARM64)

Dogfooded locally via the downloaded CI artifact on Windows 11 ARM64.

- [x] 2.1 `npm run build:desktop` on `windows-latest` emits both NSIS `.exe` and MSI; both uploaded as `windows-x64` artifact.
- [x] 2.2 NSIS `.exe` installs on Windows 11 ARM64; app launches; titlebar renders; dashboard loads after `__TAURI_INTERNALS__`-protocol fallback + `http://tauri.localhost` CORS origin allowlist were added.
- [ ] 2.3 MSI install tested on Windows 10 — deferred to post-merge smoke. *(MSI is published alongside `.exe` but not referenced by `manifest.json`; if the MSI breaks we ship NSIS-only.)*
- [x] 2.4 In-app: add project works after fix CORS + fetch-interceptor; CLI detection works after `which`→`where` + `shell:true` + Tauri macOS-only PATH gating. Terminal panel spawns PowerShell. **Setup wizard** is unblocked by the companion specrails-core PR [#256](https://github.com/fjpulidop/specrails-core/pull/256) which ports the installer to native Node (no bash/python3 required on Windows); smoke-test in task 5.4 below.
- [x] 2.5 Post-build rename step: rename Tauri's default output filenames (`SpecRails Hub_<version>_x64-setup.exe`, `SpecRails Hub_<version>_x64_en-US.msi`) to `specrails-hub-<version>-x64-setup.exe` and `specrails-hub-<version>-x64.msi`. *(Implemented in deploy-job `Rename installers to canonical filenames` step.)*

## 3. CI workflow: `build-windows` job

- [x] 3.1 Add a new `build-windows` job to `.github/workflows/desktop-release.yml` running on `windows-latest`.
- [x] 3.2 Steps: checkout, setup-node 20, setup Rust stable, Rust cache keyed on `src-tauri`, `npm ci` (root) + `cd client && npm ci`.
- [x] 3.3 Run `npm run build:desktop` with no signing env vars.
- [x] 3.4 Run the rename step from 2.5. *(Rename happens in deploy job after artifact download, not inside build-windows — see the `Rename installers to canonical filenames` step in `deploy`.)*
- [x] 3.5 Upload the renamed `.exe` and `.msi` as a single artifact named `windows-x64`.
- [ ] 3.6 Add smoke test step: launch the installed app headless (or install silently via `/S` NSIS flag in a temp dir), poll `GET http://localhost:4200/api/hub/state` with a 30s timeout, fail the job if not 200. Shut the app down cleanly. *(Deferred — adding a stable headless-install smoke test is non-trivial. For v1 we rely on the manual VM check in 2.2/2.3. Consider adding in a follow-up change once the build is known-good.)*

## 4. Deploy job updates

- [x] 4.1 Extend `deploy: needs:` to include `build-windows` in addition to `build-macos`.
- [x] 4.2 Download both artifacts (`dmg-aarch64`, `windows-x64`) into `./artifacts/`. *(Existing `download-artifact@v4` with `merge-multiple: true` picks up all artifacts automatically.)*
- [x] 4.3 Upload every binary (`.dmg`, `.exe`, `.msi`) to `downloads/specrails-hub/v<version>/` on Hostinger via FTP. *(Existing `Deploy versioned installers` step uploads the full `artifacts/` dir.)*
- [x] 4.4 Upload every binary to `downloads/specrails-hub/latest/` on Hostinger via FTP.
- [x] 4.5 HEAD-verify each uploaded binary returns HTTP 200 before proceeding; fail the job on any non-200. *(Scoped to manifest-referenced binaries: `.dmg` + `.exe`; MSI is available via versioned folder but not gated by HEAD check.)*
- [x] 4.6 Extend `manifest.json` generation to include a `platforms["windows-x64"]` entry pointing at the NSIS `.exe`, with computed `sha256` and `size`.
- [x] 4.7 Upload `manifest.json` LAST, after all HEAD checks pass.

## 5. Documentation and rollout

- [x] 5.1 Update `CLAUDE.md` release-pipeline section to describe the `build-windows` job and the Windows filename conventions.
- [x] 5.2 Add a `docs/windows.md` explaining the SmartScreen warning + core-version dependency (Node-native specrails-core ≥ 4.2.0).
- [x] 5.3 Expand `server/setup-manager.ts` checkpoint-detection regex to be tolerant of both the retired bash output and the new Node installer's stdout phrases (`Loaded install config`, `Phase 2 & 3`, `Writing manifest`, `init complete`, `update complete`).
- [x] 5.4 Sync the CLAUDE.md reserved-paths contract note with the new Node core (`init` / `update` subcommands replace `install.sh` / `update.sh`).
- [ ] 5.5 Order of release: **(a)** merge `specrails-core#256` to main → release-please → publish `specrails-core@4.2.0` on npm. **(b)** Then merge hub PR #251 → release-please → tag `v<hub-version>` → Desktop Release workflow publishes Windows + macOS builds. **(c)** Revert the temporary `tauri = { features = ["devtools"] }` in `src-tauri/Cargo.toml` right before (b).
- [ ] 5.6 Download the released Windows `.exe` from `https://specrails.dev/downloads/specrails-hub/latest/`, install on a clean Windows 10/11 VM, run the full setup wizard against a fresh project. Expected: base_install + config_written + quick_complete checkpoints all advance, at least one agent job completes end-to-end. Only after pass: update specrails-web to surface the Windows CTA.

## 6. Validation against specs

- [ ] 6.1 Verify filename regex `^specrails-hub-\d+\.\d+\.\d+-x64-setup\.exe$` matches the published NSIS installer.
- [ ] 6.2 Verify filename regex `^specrails-hub-\d+\.\d+\.\d+-x64\.msi$` matches the published MSI.
- [ ] 6.3 Fetch `manifest.json`, assert `platforms["windows-x64"]` is present with all four fields (`filename`, `url`, `sha256`, `size`).
- [ ] 6.4 Recompute sha256 of downloaded `.exe` and assert it equals `platforms["windows-x64"].sha256`.
- [ ] 6.5 Issue `HEAD` on the `.exe` URL and assert `Content-Length` equals `platforms["windows-x64"].size`.
- [ ] 6.6 After a subsequent release, verify prior version's `.exe` and `.msi` at `v<previous-version>/` still return 200.
