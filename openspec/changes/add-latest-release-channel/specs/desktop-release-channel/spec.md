## ADDED Requirements

### Requirement: Stable "latest" download URL for macOS build
The system SHALL publish the most recent signed and notarised `.dmg` for specrails-hub to a stable, version-independent URL at `https://specrails.dev/downloads/specrails-hub/latest/`. The file SHALL be the same signed and notarised artifact that is published to the versioned folder for the corresponding tag.

#### Scenario: Tag push publishes to latest folder
- **WHEN** a commit tagged `v<version>` is pushed and the `Desktop Release` workflow completes successfully
- **THEN** a file named `specrails-hub-<version>-aarch64.dmg` exists at `https://specrails.dev/downloads/specrails-hub/latest/` and returns HTTP 200

#### Scenario: Latest file matches versioned file
- **WHEN** both the `latest/` and the corresponding `v<version>/` folder have been populated by the same workflow run
- **THEN** the `.dmg` binaries at both locations have identical sha256 hashes

#### Scenario: Subsequent release replaces latest
- **WHEN** a newer tag `v<version+1>` is released
- **THEN** `https://specrails.dev/downloads/specrails-hub/latest/specrails-hub-<version+1>-aarch64.dmg` is served and any prior `.dmg` left in `latest/` from a previous release SHALL NOT be served from that folder

### Requirement: Versioned download URL remains available
The system SHALL continue to publish each released `.dmg` to its version-specific folder `https://specrails.dev/downloads/specrails-hub/v<version>/` for archival and deep linking.

#### Scenario: Versioned URL remains reachable after new release
- **WHEN** a new release is published and `latest/` has been updated
- **THEN** the previous release's `.dmg` at `https://specrails.dev/downloads/specrails-hub/v<previous-version>/` still returns HTTP 200

### Requirement: Release manifest describes the latest build
The system SHALL publish a `manifest.json` file at `https://specrails.dev/downloads/specrails-hub/latest/manifest.json` that describes the most recent release. The manifest SHALL be a UTF-8 encoded JSON document with the following fields:

- `schemaVersion` (integer): currently `1`.
- `version` (string): semver version of the release, without a leading `v` (e.g. `"1.30.0"`).
- `releasedAt` (string): ISO 8601 UTC timestamp of when the release was published.
- `releaseUrl` (string): HTTPS URL of the corresponding GitHub Release page.
- `platforms` (object): map whose keys are `<os>-<arch>` identifiers (e.g. `darwin-arm64`). Each value contains:
  - `filename` (string): the `.dmg` filename inside `latest/`.
  - `url` (string): absolute HTTPS URL of the `.dmg` inside `latest/`.
  - `sha256` (string): lowercase hex sha256 of the `.dmg`.
  - `size` (integer): size of the `.dmg` in bytes.

#### Scenario: Manifest is valid JSON and matches schema
- **WHEN** a release completes and `manifest.json` is fetched
- **THEN** it parses as JSON, contains `schemaVersion`, `version`, `releasedAt`, `releaseUrl`, and a `platforms` object with at least `darwin-arm64`

#### Scenario: Manifest reflects the most recent release
- **WHEN** the release for tag `v<version>` completes
- **THEN** `manifest.json.version === "<version>"` (no leading `v`)

#### Scenario: Manifest sha256 matches the published binary
- **WHEN** the consumer downloads the file referenced by `platforms["darwin-arm64"].url` and computes its sha256
- **THEN** the result equals `platforms["darwin-arm64"].sha256`

#### Scenario: Manifest size matches the published binary
- **WHEN** the consumer issues `HEAD` on the file referenced by `platforms["darwin-arm64"].url`
- **THEN** the returned `Content-Length` equals `platforms["darwin-arm64"].size`

### Requirement: Manifest is uploaded after the binary
The system SHALL upload the `.dmg` to `latest/` before uploading `manifest.json`. This ordering SHALL prevent a race in which a consumer reads a manifest referencing a binary that has not yet been published.

#### Scenario: Deploy step ordering
- **WHEN** the desktop-release deploy job runs
- **THEN** the `.dmg` file is fully uploaded to the FTP server before the `manifest.json` file is uploaded

### Requirement: Manifest cache is short-lived
The system SHALL serve `manifest.json` from `latest/` with HTTP cache headers that prevent intermediate caches from returning a stale version to a consumer across releases. Cache-Control SHALL be set to `no-cache, must-revalidate`.

#### Scenario: Browser fetches manifest after new release
- **WHEN** a browser has previously fetched `manifest.json` before a release and fetches it again after the release
- **THEN** the browser receives the new manifest (not a cached prior version) assuming the server is reachable

### Requirement: Released filename includes the version
The `.dmg` filename published to both `latest/` and `v<version>/` SHALL contain the release version so that a consumer can derive the version by parsing the filename when the manifest is unavailable.

#### Scenario: Filename contains semver
- **WHEN** the release for tag `v<version>` publishes
- **THEN** the `.dmg` filename matches the regular expression `^specrails-hub-\d+\.\d+\.\d+-aarch64\.dmg$` and the captured version equals the release version
