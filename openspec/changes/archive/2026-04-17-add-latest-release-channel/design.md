## Context

specrails-hub ships a signed + notarized macOS `.dmg` through `.github/workflows/desktop-release.yml`. The workflow is triggered by `push: tags: ["v*"]` or manual dispatch. Current behaviour:

1. A macOS runner builds the Tauri desktop app and uploads the artifact.
2. An Ubuntu "deploy" job downloads the artifact and FTP-uploads it to Hostinger at `domains/specrails.dev/public_html/downloads/specrails-hub/<tag>/` (e.g. `/downloads/specrails-hub/v1.30.0/`).

Consumers of that URL must know the exact version ahead of time. specrails-web wants a hero-level Download CTA that always points to the newest build and surfaces the current version without a hardcoded string or a GitHub API call at page load time.

We currently ship macOS Apple Silicon only (see recent commit `babb0f0 ci: drop x64 matrix, build Apple Silicon only`). Designing the channel to be future-extensible to additional platforms is cheap and worth doing now.

## Goals / Non-Goals

**Goals:**
- Provide a stable, versionless URL for the most recent `.dmg`.
- Expose a small JSON manifest describing the release so consumers can render version and integrity info without scraping HTML or calling the GitHub API.
- Keep the existing versioned folder (`v<version>/`) working unchanged for archival, direct links, and deep links from changelogs.
- Keep the workflow easy to extend to Windows / Intel Mac / Linux later without re-plumbing the channel.

**Non-Goals:**
- Auto-updates inside the desktop app (Tauri updater). Out of scope; separate future work.
- Code-signing or notarisation changes. Reuse existing Apple cert + API key flow.
- Cross-repo automation that copies the hub-demo build into specrails-web. Orthogonal concern, future spec.
- Intel / Windows / Linux builds. macOS Apple Silicon only today.
- Any web-side change. specrails-web consumes the manifest in a separate change.

## Decisions

### Decision 1: Stable URL via `latest/` folder, not symlink or redirect
Hostinger FTP does not support symlinks reliably across shared hosting and HTTP redirects would add a round-trip. Copying the `.dmg` into a `latest/` folder on every release is simple, deterministic, and cacheable.

Alternatives considered:
- HTTP redirect from `latest/` to versioned path — extra latency, needs `.htaccess` per release.
- Symlink — not portable over FTP.
- Rely solely on GitHub Releases "latest" API — unauthenticated rate limits + CORS risk at page load.

### Decision 2: Manifest schema is flat and versioned
`manifest.json` uses a minimal flat schema. A top-level `schemaVersion` field lets consumers detect and ignore incompatible future changes. The release-specific fields describe one build at a time; multi-platform is layered in later by promoting platform-specific fields into a nested object.

Minimum schema (v1):
```json
{
  "schemaVersion": 1,
  "version": "1.30.0",
  "releasedAt": "2026-04-17T08:54:20Z",
  "releaseUrl": "https://github.com/fjpulidop/specrails-hub/releases/tag/v1.30.0",
  "platforms": {
    "darwin-arm64": {
      "filename": "specrails-hub-1.30.0-aarch64.dmg",
      "url": "https://specrails.dev/downloads/specrails-hub/latest/specrails-hub-1.30.0-aarch64.dmg",
      "sha256": "<64-hex>",
      "size": 123456789
    }
  }
}
```

Rationale for nested `platforms` even though we ship one today:
- Adding `darwin-x64`, `win32-x64`, `linux-x64` later is a purely additive change; consumers that already handle `platforms["darwin-arm64"]` keep working.
- Flat alternative (`filename`, `sha256`, `size` at top level) forces a breaking rename when a second platform ships.

Alternatives considered:
- GitHub Releases asset JSON — same information, but requires a live network call to `api.github.com` with CORS + rate-limit risk.
- Version-only manifest (no checksum) — smaller but weaker integrity story; sha256 is cheap to compute on the runner.

### Decision 3: Filename includes the version
Name pattern `specrails-hub-<version>-<arch>.dmg` (e.g. `specrails-hub-1.30.0-aarch64.dmg`) is used in both `v<version>/` and `latest/`. Putting the version in the filename gives two fallbacks when the manifest is unreachable:
1. Filename-based version display (regex).
2. Easier human debugging when a user downloads from the stable URL.

Today Tauri's default output is already version-aware; we just need to rename or copy-with-rename in the workflow.

### Decision 4: Computation and upload happen on the Ubuntu deploy job
The macOS build job stays focused on compilation + signing. The Ubuntu deploy job already downloads the artifact, so computing sha256 + size + timestamp and authoring `manifest.json` there is cheap and keeps runner minutes low (no extra macOS time).

### Decision 5: Keep versioned folder untouched
The `v<tag>/` path already exists and is referenced elsewhere (changelogs, blog posts, prior releases). It continues to be populated exactly as today. `latest/` is strictly additive.

### Decision 6: Write manifest last, after `.dmg` is fully uploaded
Consumers may poll `manifest.json` right after a release notification. Uploading the `.dmg` before the manifest guarantees that a consumer that sees the new manifest can successfully download the referenced binary (no 404 race).

## Risks / Trade-offs

- **[FTP upload partially fails, leaves stale `manifest.json` pointing to missing binary]** → Order of operations: upload `.dmg` first, verify 200 on HEAD, then upload `manifest.json`. If the step fails after `.dmg` upload but before manifest, next re-run fixes it.
- **[Cache of old `manifest.json` at CDN / browser]** → Set `Cache-Control: no-cache, must-revalidate` via `.htaccess` for `latest/manifest.json`, or append `?t=<timestamp>` query string on the web side when fetching. Pick `.htaccess` — one-time server config.
- **[Version in filename diverges from version in manifest]** → Single source of truth: `package.json` version, read once in the deploy job and reused for both filename and manifest.
- **[Workflow secret rotation breaks publish silently]** → Pre-existing risk, unchanged. No new secrets introduced.
- **[Adding new platforms later requires coordinated changes in web]** → Nested `platforms` object absorbs additions without breaking consumers that only read `darwin-arm64`. Document the expansion policy in the spec.

## Migration Plan

1. Update `.github/workflows/desktop-release.yml` with new deploy steps (rename, compute sha256, upload to `latest/`, write and upload `manifest.json`).
2. Add a `.htaccess` fragment (or edit existing) under `domains/specrails.dev/public_html/downloads/specrails-hub/latest/` to set `Cache-Control: no-cache` on `manifest.json`.
3. Cut a patch release (`v1.30.1` or next `fix:` commit) to exercise the full path end-to-end.
4. Verify:
   - `https://specrails.dev/downloads/specrails-hub/latest/specrails-hub-<ver>-aarch64.dmg` returns 200.
   - `https://specrails.dev/downloads/specrails-hub/latest/manifest.json` returns valid JSON matching the schema.
   - `https://specrails.dev/downloads/specrails-hub/v<ver>/...` still resolves (backwards compat).
5. No rollback needed — if `latest/` publish fails, versioned publish is unaffected. Web-side fetch handles missing manifest gracefully (see Spec 3).

## Open Questions

- Should the manifest also include release notes / changelog snippet? Leaning no — changelog lives in `CHANGELOG.md` and GitHub Releases; manifest stays minimal. Revisit if the web wants to render "What's new" inline.
- Should we produce a detached `.dmg.sha256` sidecar file in addition to embedding sha256 in the manifest? Probably redundant given manifest consumers, skip for now.
