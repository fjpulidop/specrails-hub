## 1. Sidecar build validation on Windows (empirical — CI-validated)

These tasks require a Windows runtime. They will be exercised by the first real `build-windows` CI run on the feature branch / tag push. Leave unchecked until CI confirms.

- [ ] 1.1 Run `scripts/build-sidecar.mjs` locally (or via a throwaway GitHub Actions workflow) on `windows-latest` and verify it emits `src-tauri/binaries/specrails-server-x86_64-pc-windows-msvc.exe` without errors.
- [ ] 1.2 Verify the emitted sidecar binary, when launched directly, starts the Express server on port 4200 and responds 200 to `GET /api/hub/state`.
- [ ] 1.3 Verify `better_sqlite3.node` (or win32 equivalent prebuilt) is copied into `src-tauri/binaries/` and is loaded by the sidecar without `ERR_DLOPEN_FAILED`.
- [ ] 1.4 Verify `node-pty` resources (`conpty.node` and/or `winpty-agent.exe` depending on node-pty version) land under `src-tauri/binaries/node-pty/` and are picked up by the `resources` glob in `tauri.conf.json`.
- [ ] 1.5 If any patch in `server/index.ts` (`Module._resolveFilename`/`_load`, `process.dlopen`) fails on win32, adjust the win32 branch — keep patches minimal and platform-guarded.

## 2. Tauri Windows installer build (empirical — Windows VM)

These require an actual Windows VM with a human at the keyboard. Park until an artifact is downloadable from GHA or from `latest/`.

- [ ] 2.1 On the Windows runner, run `npm run build:desktop` and confirm Tauri emits both `src-tauri/target/release/bundle/nsis/*.exe` and `src-tauri/target/release/bundle/msi/*.msi`.
- [ ] 2.2 Install the NSIS `.exe` on a clean Windows 11 VM. Confirm "SpecRails Hub" launches, the window renders with custom titlebar, and the dashboard loads at `http://localhost:4200`.
- [ ] 2.3 Install the MSI on a clean Windows 10 VM. Confirm the same launch path. If MSI install fails due to missing publisher metadata, file a follow-up and ship NSIS-only for v1 (update `manifest.json` entry accordingly).
- [ ] 2.4 In the installed app, add a project, enqueue a trivial agent job, open the terminal panel and confirm PowerShell spawns and responds. No regression in hub features.
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
- [x] 5.2 Add a short note in the project README (or a new `docs/windows.md`) explaining the SmartScreen warning and the "More info → Run anyway" workaround for v1 unsigned releases.
- [ ] 5.3 Merge the PR to `main`, let release-please produce a Release PR, merge that Release PR so the `v<version>` tag triggers the full pipeline (no staging/rc path — specrails-web won't render a Windows CTA until explicitly updated, so publishing to prod `latest/` is safe).
- [ ] 5.4 Download the Windows `.exe` from `https://specrails.dev/downloads/specrails-hub/latest/` and smoke-test on a clean Windows 10/11 VM (install, launch, add a project, run one agent job, open terminal). Only after pass: update specrails-web to surface the Windows CTA.

## 6. Validation against specs

- [ ] 6.1 Verify filename regex `^specrails-hub-\d+\.\d+\.\d+-x64-setup\.exe$` matches the published NSIS installer.
- [ ] 6.2 Verify filename regex `^specrails-hub-\d+\.\d+\.\d+-x64\.msi$` matches the published MSI.
- [ ] 6.3 Fetch `manifest.json`, assert `platforms["windows-x64"]` is present with all four fields (`filename`, `url`, `sha256`, `size`).
- [ ] 6.4 Recompute sha256 of downloaded `.exe` and assert it equals `platforms["windows-x64"].sha256`.
- [ ] 6.5 Issue `HEAD` on the `.exe` URL and assert `Content-Length` equals `platforms["windows-x64"].size`.
- [ ] 6.6 After a subsequent release, verify prior version's `.exe` and `.msi` at `v<previous-version>/` still return 200.
