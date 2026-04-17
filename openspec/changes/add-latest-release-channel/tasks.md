## 1. Workflow Plumbing

- [x] 1.1 Read release version from `package.json` (or from `github.ref_name`) once in the deploy job and export it as a step output for downstream steps
- [x] 1.2 Rename or copy the built `.dmg` to the canonical name `specrails-hub-<version>-aarch64.dmg` before FTP upload, matching the filename regex in the spec
- [x] 1.3 Compute sha256 and byte size of the renamed `.dmg` on the Ubuntu deploy runner and export both as step outputs
- [x] 1.4 Upload the renamed `.dmg` to the existing `downloads/specrails-hub/v<version>/` folder (unchanged behavior, just new filename)

## 2. Latest Channel Upload

- [x] 2.1 Upload the same `.dmg` to `downloads/specrails-hub/latest/` via FTP (implemented with `curl` so ordering with the manifest upload is deterministic; old `.dmg` files in `latest/` are explicitly deleted first to avoid accumulation while leaving `.htaccess` untouched)
- [x] 2.2 Verify the `.dmg` is reachable via HTTP HEAD on `https://specrails.dev/downloads/specrails-hub/latest/specrails-hub-<version>-aarch64.dmg` before proceeding to manifest upload; fail the job if it does not return HTTP 200

## 3. Manifest Generation

- [x] 3.1 Generate `manifest.json` on the runner using the schema defined in `design.md` §Decision 2 (schemaVersion=1, version, releasedAt, releaseUrl, platforms.darwin-arm64 with filename/url/sha256/size)
- [x] 3.2 Populate `releasedAt` with the job's UTC timestamp in ISO 8601 format (use `date -u +"%Y-%m-%dT%H:%M:%SZ"` in bash)
- [x] 3.3 Populate `releaseUrl` with `https://github.com/fjpulidop/specrails-hub/releases/tag/v<version>`
- [x] 3.4 Validate that the generated JSON parses successfully (e.g. `jq empty manifest.json`) before upload

## 4. Manifest Upload

- [x] 4.1 Upload `manifest.json` to `downloads/specrails-hub/latest/manifest.json` AFTER the `.dmg` HEAD check succeeds
- [x] 4.2 Verify `https://specrails.dev/downloads/specrails-hub/latest/manifest.json` returns HTTP 200 and parseable JSON

## 5. Cache Headers

- [ ] 5.1 Add (or update) an `.htaccess` snippet inside `domains/specrails.dev/public_html/downloads/specrails-hub/latest/` that sets `Cache-Control: no-cache, must-revalidate` on `manifest.json` — **MANUAL**: server-side one-time step on Hostinger; exact `.htaccess` contents are embedded as a comment in `.github/workflows/desktop-release.yml` so they can be copy-pasted into the server's File Manager
- [x] 5.2 Document in the workflow comments that the `.htaccess` lives on the server, not in the repo (one-time Hostinger step)

## 6. End-to-End Verification

- [ ] 6.1 Trigger a dry-run of the workflow via `workflow_dispatch` against a pre-release tag in a non-main branch, confirm both `latest/` and `v<tag>/` are populated — **MANUAL**: defer to the next release or a dedicated dispatch
- [ ] 6.2 Fetch `manifest.json` and confirm `version`, `filename`, `url`, `sha256`, `size` are all correct — **MANUAL**: defer
- [ ] 6.3 Download the `.dmg` from the `url` in the manifest and confirm its sha256 matches the manifest field — **MANUAL**: defer
- [ ] 6.4 Confirm the previous `v<older-version>/` URL still resolves (regression check) — **MANUAL**: defer

## 7. Documentation

- [x] 7.1 Update `CLAUDE.md` release-pipeline section to mention the new `latest/` channel and `manifest.json` output (one short paragraph)
- [x] 7.2 Add a brief inline comment in `desktop-release.yml` near the new steps pointing to the openspec change id `add-latest-release-channel` so future contributors can find the rationale
