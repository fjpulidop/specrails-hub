# agent-profiles Specification

## Purpose
TBD - created by archiving change add-agents-profiles. Update Purpose after archive.
## Requirements
### Requirement: Profile catalog CRUD
The hub SHALL manage named agent profiles as JSON files under `<project>/.specrails/profiles/`. The hub SHALL provide server endpoints to list, read, create, update, duplicate, rename, and delete profiles.

#### Scenario: List profiles
- **WHEN** `GET /api/projects/:projectId/profiles` is called
- **THEN** the response is `{ profiles: [{ name, description, isDefault, updatedAt }] }` for every `*.json` file in `.specrails/profiles/` excluding `.user-preferred.json`

#### Scenario: Create profile
- **WHEN** `POST /api/projects/:projectId/profiles` is called with a valid v1 profile body
- **THEN** the hub writes the JSON to `.specrails/profiles/<name>.json`, validates it against `schemas/profile.v1.json`, and returns HTTP 201 with the stored profile

#### Scenario: Create with duplicate name
- **WHEN** a profile with the given name already exists
- **THEN** the endpoint returns HTTP 409 with a clear error naming the conflict

#### Scenario: Delete default profile
- **WHEN** `DELETE /api/projects/:projectId/profiles/default` is called
- **THEN** the endpoint returns HTTP 400 with an error: "cannot delete the default profile"

### Requirement: Schema validation on every write
The hub SHALL validate every profile write against the v1 JSON schema shipped by specrails-core. Writes that fail validation SHALL be rejected before hitting disk.

#### Scenario: Invalid schemaVersion rejected
- **WHEN** a profile body with `schemaVersion: 2` is POSTed
- **THEN** the endpoint returns HTTP 400 with the validation error and no file is written

#### Scenario: Missing required field rejected
- **WHEN** a profile body missing `agents` is POSTed
- **THEN** the endpoint returns HTTP 400 identifying the missing field

### Requirement: Profile resolution at launch
The hub SHALL resolve the effective profile for each rail invocation in this order: (1) an explicit selection passed at launch time, (2) the project's per-developer preference (`.user-preferred.json`) if set, (3) the profile named `default`. The resolved profile is snapshotted before spawn.

#### Scenario: Launch with explicit selection
- **WHEN** a single-feature launch dialog submits `profile: "data-heavy"`
- **THEN** the hub resolves to `data-heavy` regardless of other preferences

#### Scenario: Launch with preference
- **WHEN** no explicit selection is given AND `.user-preferred.json` names `security-heavy`
- **THEN** the hub resolves to `security-heavy`

#### Scenario: Launch without preference
- **WHEN** no explicit selection AND no `.user-preferred.json`
- **THEN** the hub resolves to `default`

### Requirement: Snapshot-per-job
The hub SHALL write a snapshot of the resolved profile to `~/.specrails/projects/<slug>/jobs/<jobId>/profile.json` before spawning a rail. The snapshot SHALL be chmod-400 and referenced by absolute path via `SPECRAILS_PROFILE_PATH` in the spawned process environment.

#### Scenario: Snapshot written before spawn
- **WHEN** `QueueManager` starts a rail with resolved profile `data-heavy`
- **THEN** the byte contents of `.specrails/profiles/data-heavy.json` are copied to `~/.specrails/projects/<slug>/jobs/<jobId>/profile.json` before the `claude` process starts

#### Scenario: Env var injected at spawn
- **WHEN** `QueueManager` spawns `claude` for a profile-scoped rail
- **THEN** the spawned process environment contains `SPECRAILS_PROFILE_PATH=/abs/path/to/job-snapshot.json`

#### Scenario: Snapshot immutability
- **WHEN** a running rail's snapshot file is attempted to be modified
- **THEN** the filesystem permission prevents writes (chmod 400)

### Requirement: `job_profiles` persistence
The hub SHALL persist `{jobId, profileName, profileJson, createdAt}` in a `job_profiles` table of the per-project SQLite database for every profile-scoped rail.

#### Scenario: Row written after snapshot
- **WHEN** a rail is launched with profile `data-heavy`
- **THEN** `job_profiles` contains a row matching the rail's `jobId`, `profile_name = "data-heavy"`, `profile_json` equal to the snapshot contents, and `created_at` within 5 seconds of spawn

### Requirement: Legacy fallback when core is older than 4.1.0
The hub SHALL detect specrails-core version via `doctor`/`compat-check` and SHALL NOT inject `SPECRAILS_PROFILE_PATH` into spawns when the project's core is older than 4.1.0. A UI banner SHALL prompt the user to upgrade.

#### Scenario: Project with core 4.0.x launches rail
- **WHEN** the project's installed specrails-core is 4.0.8 AND the user launches a rail
- **THEN** `QueueManager` spawns `claude` WITHOUT `SPECRAILS_PROFILE_PATH` (legacy behavior)
- **AND** the Agents tab shows an upgrade banner

#### Scenario: Project with core 4.1.0+ launches rail
- **WHEN** the project's installed specrails-core is 4.1.0 or newer AND a profile is selected
- **THEN** `QueueManager` injects `SPECRAILS_PROFILE_PATH` pointing at the snapshot

### Requirement: Batch per-rail profile forwarding
The hub SHALL support per-rail profile selection in batch-implement launches. Each rail in the batch SHALL receive its own resolved profile, snapshot, and env var. Distinct profiles for different rails in the same batch SHALL be supported without coupling.

#### Scenario: Batch with mixed profiles
- **WHEN** a batch of 3 rails is launched with per-rail profile selections `default`, `security-heavy`, `data-heavy`
- **THEN** three distinct snapshots are written, one per jobId, and each spawn receives its own `SPECRAILS_PROFILE_PATH`

#### Scenario: Concurrent rails with same profile
- **WHEN** two rails in a batch share profile `default`
- **THEN** each rail still receives its own snapshot file (separate `jobId` directories) and its own env var

### Requirement: Per-developer picker preference
The hub SHALL persist the developer's last-selected profile per project to `<project>/.specrails/profiles/.user-preferred.json` (gitignored). This file SHALL be used as the launch-dialog default.

#### Scenario: Preference persisted after launch
- **WHEN** the user selects `data-heavy` in a launch dialog and submits
- **THEN** `.user-preferred.json` is written with `{profile: "data-heavy"}` after the launch completes

#### Scenario: `.gitignore` entry created
- **WHEN** the hub writes `.user-preferred.json` for the first time in a project
- **THEN** the hub appends `.specrails/profiles/.user-preferred.json` to `.gitignore` if not already present

### Requirement: Telemetry enrichment
The hub SHALL set OTEL resource attributes `specrails.profile_name` and `specrails.profile_schema_version` on every telemetry signal emitted by a profile-scoped rail.

#### Scenario: Telemetry carries profile name
- **WHEN** a rail running profile `data-heavy` emits a trace to `/otlp/v1/traces`
- **THEN** the signal's resource attributes contain `specrails.profile_name = "data-heavy"` and `specrails.profile_schema_version = 1`

### Requirement: Profile analytics
The Analytics page SHALL surface per-profile metrics for the current project: job count, success rate, average tokens, and average duration, filterable by time window.

#### Scenario: Profile usage card shown
- **WHEN** the Analytics page loads for a project with at least one profile-scoped job
- **THEN** a "Profile usage" section displays a bar chart of job counts per profile name for the default window (last 30 days)

#### Scenario: Empty state
- **WHEN** the project has no profile-scoped jobs yet
- **THEN** the section shows an empty state pointing to the Agents tab

