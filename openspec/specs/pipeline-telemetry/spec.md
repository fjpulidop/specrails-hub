# pipeline-telemetry Specification

## Purpose
TBD - created by archiving change pipeline-telemetry. Update Purpose after archive.
## Requirements
### Requirement: Per-project telemetry toggle
The system SHALL expose a per-project setting `pipelineTelemetryEnabled` in the project `SettingsPage`, persisted in the per-project SQLite database. The default value SHALL be `false`. The setting SHALL NOT be exposed in legacy (single-project) mode.

#### Scenario: Default state for a new project
- **WHEN** a user adds a new project to the hub
- **THEN** `pipelineTelemetryEnabled` is `false` and the toggle in `SettingsPage` reflects OFF

#### Scenario: Persisting the toggle
- **WHEN** a user toggles `pipelineTelemetryEnabled` to ON in `SettingsPage` and navigates away
- **THEN** the value persists in the per-project SQLite and remains ON on subsequent hub restarts

#### Scenario: Setting is scoped per project
- **WHEN** a user toggles the setting ON in project A
- **THEN** project B's setting remains at its previous value (unchanged)

### Requirement: OTEL env injection at QueueManager spawn
The system SHALL, when `pipelineTelemetryEnabled` is `true` for a project, inject the following environment variables into every `claude` child process spawned by that project's `QueueManager`:

- `CLAUDE_CODE_ENABLE_TELEMETRY=1`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<hubPort>/otlp`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
- `OTEL_METRICS_EXPORTER=otlp`
- `OTEL_LOGS_EXPORTER=otlp`
- `OTEL_TRACES_EXPORTER=otlp`
- `OTEL_RESOURCE_ATTRIBUTES=specrails.job_id=<jobId>,specrails.project_id=<projectId>`

When `pipelineTelemetryEnabled` is `false`, NONE of these variables SHALL be injected. The injection SHALL NOT apply to `ChatManager` or `SetupManager` spawns.

#### Scenario: Setting ON — env injected
- **WHEN** `QueueManager` spawns `claude` for a job in a project with telemetry ON
- **THEN** the child process environment contains all OTEL variables listed above with the correct `jobId` and `projectId` in `OTEL_RESOURCE_ATTRIBUTES`

#### Scenario: Setting OFF — no env injection
- **WHEN** `QueueManager` spawns `claude` for a job in a project with telemetry OFF
- **THEN** the child process environment contains none of the OTEL variables

#### Scenario: ChatManager is not instrumented
- **WHEN** `ChatManager` spawns `claude` for a project with telemetry ON
- **THEN** no OTEL variables are injected into that spawn

#### Scenario: SetupManager is not instrumented
- **WHEN** `SetupManager` spawns `claude` for a project with telemetry ON
- **THEN** no OTEL variables are injected into that spawn

### Requirement: Embedded OTLP/JSON receiver
The system SHALL expose HTTP endpoints on the Express server for OTLP/JSON ingestion:

- `POST /otlp/v1/traces`
- `POST /otlp/v1/metrics`
- `POST /otlp/v1/logs`

Each endpoint SHALL accept OTLP/JSON payloads, extract `specrails.job_id` and `specrails.project_id` from `resource.attributes`, and route the payload to the corresponding per-job telemetry blob. Payloads missing both attributes SHALL be rejected with HTTP 400. Payloads naming an unknown `jobId` SHALL be rejected with HTTP 404. All successful writes SHALL return HTTP 200.

#### Scenario: Routing by resource attributes
- **WHEN** a valid OTLP/JSON traces payload arrives with `specrails.job_id=J1` and `specrails.project_id=P1`
- **THEN** the payload is appended to the blob file for job J1 in project P1 and the response is HTTP 200

#### Scenario: Missing resource attributes
- **WHEN** an OTLP/JSON payload arrives without both `specrails.job_id` and `specrails.project_id`
- **THEN** the response is HTTP 400 and nothing is written to disk

#### Scenario: Unknown job id
- **WHEN** an OTLP/JSON payload names a `specrails.job_id` that does not exist in the project's `jobs.sqlite`
- **THEN** the response is HTTP 404 and nothing is written to disk

### Requirement: Per-job raw blob storage
The system SHALL persist raw OTLP payloads for each job as an append-only gzipped NDJSON file at `~/.specrails/projects/<slug>/telemetry/<jobId>.ndjson.gz`. Each line SHALL be one JSON object of the shape `{signal: "traces"|"metrics"|"logs", receivedAt: <ISO timestamp>, payload: <raw OTLP JSON>}`.

The system SHALL register a pointer row in a new per-project SQLite table `telemetry_blobs(jobId TEXT PRIMARY KEY, path TEXT, byteSize INTEGER, startedAt INTEGER, endedAt INTEGER, state TEXT)` where `state ∈ {"active","compacted","expired"}`.

#### Scenario: First payload creates blob and pointer
- **WHEN** the first telemetry payload arrives for job J1
- **THEN** a new `telemetry/<J1>.ndjson.gz` file is created and a row is inserted into `telemetry_blobs` with `state="active"` and `startedAt` set

#### Scenario: Subsequent payloads append
- **WHEN** additional telemetry payloads arrive for the same job J1
- **THEN** they are appended to the existing blob file as new NDJSON lines and `byteSize` / `endedAt` on the pointer row are updated

### Requirement: Size cap and overflow handling
The system SHALL enforce a hard cap of 10 MB (uncompressed) per job telemetry blob. Once the cap is reached:

- Further `logs` payloads for that job SHALL be dropped.
- `traces` and `metrics` payloads SHALL continue to be accepted.
- A single marker line SHALL be appended at the point of overflow: `{signal: "control", event: "logs_truncated", at: <ISO timestamp>}`.

#### Scenario: Cap reached mid-job
- **WHEN** a job's uncompressed blob size reaches 10 MB
- **THEN** further `logs` OTLP payloads are discarded, a `logs_truncated` control line is written once, and `traces` and `metrics` continue to be recorded

### Requirement: Retention and compaction
The system SHALL run a compaction pass at Express server startup. For each row in `telemetry_blobs` with `state="active"` whose `endedAt` is older than 7 days (or, if `endedAt` is null, whose `startedAt` is older than 7 days), the system SHALL:

1. Compute per-phase summary aggregates (duration, total input/output/cache tokens, tool call counts by type, API error count, cost USD) from the blob.
2. Insert one row per phase into a new per-project SQLite table `telemetry_summaries(jobId TEXT, phase TEXT, durationMs INTEGER, tokensInput INTEGER, tokensOutput INTEGER, tokensCache INTEGER, toolCalls TEXT, apiErrors INTEGER, costUsd REAL, PRIMARY KEY (jobId, phase))`.
3. Delete the blob file from disk.
4. Update the pointer row to `state="compacted"` and set `path=NULL`.

Jobs whose project has been deleted SHALL have their telemetry directory and rows removed by the same compaction pass.

#### Scenario: Blob older than 7 days compacts
- **WHEN** the server starts and a telemetry blob's `endedAt` is 10 days old
- **THEN** per-phase summary rows are written to `telemetry_summaries`, the blob file is deleted, and the pointer row state becomes `compacted`

#### Scenario: Blob younger than 7 days untouched
- **WHEN** the server starts and a telemetry blob's `endedAt` is 3 days old
- **THEN** the blob file remains on disk and the pointer row state remains `active`

### Requirement: Export diagnostic zip
The system SHALL expose a `[Export diagnostic]` action on the job detail page (not on the compact job row in the recent-jobs list). The button SHALL be visible if and only if a row exists in `telemetry_blobs` for that job with `state ∈ {"active","compacted"}`, regardless of the current `pipelineTelemetryEnabled` value. Its absence or presence SHALL NOT alter layout of any other job UI surface (e.g. no reserved slot in the job row).

When invoked, the server SHALL produce a zip file named `specrails-diagnostic-<jobId>-<YYYY-MM-DD>.zip` containing:

- `job-metadata.json`: job record (id, status, phase list, timestamps, cost).
- `telemetry.ndjson`: the decompressed raw NDJSON if `state="active"`; an empty file with a single header line if `state="compacted"`.
- `logs.txt`: the existing job log content already persisted by the hub.
- `summary.md`: human-readable summary derived from either raw blob (if active) or `telemetry_summaries` rows (if compacted). Includes `truncated: true` note if the 10 MB cap was hit during the run.

The client SHALL trigger a browser download when the action is invoked.

#### Scenario: Button hidden with no telemetry
- **WHEN** a job has no row in `telemetry_blobs`
- **THEN** the `[Export diagnostic]` button is not rendered on the job detail page

#### Scenario: Button visible after toggle flipped OFF
- **WHEN** a job ran with telemetry ON and the user subsequently toggles telemetry OFF
- **THEN** the `[Export diagnostic]` button remains visible on the job detail page

#### Scenario: Recent-jobs row layout stable regardless of telemetry
- **WHEN** the recent-jobs list shows a mix of jobs with and without telemetry data
- **THEN** every row has identical action affordances — the `[Export diagnostic]` button appears only on the job detail page, never in the row

#### Scenario: Export of active blob
- **WHEN** the user clicks `[Export diagnostic]` on a job with `state="active"`
- **THEN** the browser downloads a zip containing `job-metadata.json`, decompressed `telemetry.ndjson`, `logs.txt`, and `summary.md`

#### Scenario: Export of compacted job
- **WHEN** the user clicks `[Export diagnostic]` on a job with `state="compacted"`
- **THEN** the zip's `summary.md` is derived from `telemetry_summaries` and `telemetry.ndjson` contains only a header line stating that raw data has been compacted

#### Scenario: Export reports truncation
- **WHEN** the job's blob was truncated due to the 10 MB cap
- **THEN** `summary.md` in the exported zip contains a `truncated: true` note at the top

