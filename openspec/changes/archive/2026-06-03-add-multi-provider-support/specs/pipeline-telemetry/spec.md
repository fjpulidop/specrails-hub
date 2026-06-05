## ADDED Requirements

### Requirement: Synthetic OTEL bridge for providers without native OTEL env support

For providers whose adapter declares `capabilities.nativeOtelEnv === false`, the hub SHALL emit OTLP signals on the provider's behalf by parsing the provider's stream events and writing OTLP/JSON payloads to its own embedded receiver. The bridge MUST run when, and only when, `pipelineTelemetryEnabled === true` for the project. The set of signals produced MUST cover traces, metrics, and logs equivalent to what a natively-instrumented Claude job emits, so that downstream consumers (`telemetry_blobs`, `telemetry.ndjson`, compaction, the diagnostic export ZIP) do not need provider-specific code paths.

The bridge MUST map the provider's stream events to OTLP shapes:

- Adapter event `kind: 'session-started'` → root span start (`name: 'specrails.job.run'`), capture the session id as resource attribute `specrails.<provider-id>.session_id` and `specrails.job_id` from the spawn metadata.
- Adapter event `kind: 'tool-use'` → span event on the current span.
- Adapter event `kind: 'text-delta'` → log line appended to the bridge's `logs` accumulator.
- Adapter event `kind: 'result'` → root span end carrying `usage.*` attributes; one metric data point per token field (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` if available, `reasoning_output_tokens` if available); one duration metric.

#### Scenario: Codex job emits synthetic spans via the bridge
- **GIVEN** `codexAdapter.capabilities.nativeOtelEnv === false` and `pipelineTelemetryEnabled === true` for the project
- **WHEN** a codex rail job runs to completion
- **THEN** the hub's embedded OTLP receiver records at least one trace, one metric data point, and one log line tagged with `specrails.job_id = <jobId>` and `specrails.project_id = <projectId>`

#### Scenario: Bridge is suppressed when telemetry is OFF
- **GIVEN** `pipelineTelemetryEnabled === false` for the project
- **WHEN** a codex rail job runs
- **THEN** the bridge does not write to the OTLP receiver
- **AND** no `telemetry_blobs` row is created for the job

#### Scenario: Bridge respects the existing 10 MB cap
- **WHEN** a long-running codex job emits more than 10 MB of synthetic log entries
- **THEN** the bridge stops appending log payloads at the cap
- **AND** the same `{signal: "control", event: "logs_truncated", at: <ISO timestamp>}` marker is written exactly once
- **AND** subsequent traces and metrics continue to be written

#### Scenario: Bridge does not run for ChatManager or SetupManager spawns
- **WHEN** a codex Explore Spec turn (ChatManager) or codex setup-enrich (SetupManager) spawn runs
- **THEN** the bridge does not run regardless of `pipelineTelemetryEnabled`
- **AND** no `telemetry_blobs` row is created

### Requirement: Telemetry export ZIP is provider-agnostic

`GET /api/projects/:projectId/jobs/:jobId/diagnostic` SHALL produce a ZIP with the same structure (`job-metadata.json`, `telemetry.ndjson`, `logs.txt`, `summary.md`) regardless of which provider ran the job. The `summary.md` section MUST identify the provider that produced the data and disclose whether the OTLP signals were captured natively (provider emitted OTEL env-driven) or synthesised by the hub bridge.

#### Scenario: Codex job export looks structurally identical to Claude
- **WHEN** the user downloads the diagnostic ZIP for a completed codex job with telemetry enabled
- **THEN** the ZIP contains `job-metadata.json`, `telemetry.ndjson`, `logs.txt`, `summary.md`
- **AND** `summary.md` includes a line like `Provider: codex (signals synthesised by hub bridge)`

#### Scenario: Claude job export remains unchanged
- **WHEN** the user downloads the diagnostic ZIP for a completed claude job with telemetry enabled
- **THEN** the ZIP structure is unchanged from the pre-change behaviour
- **AND** `summary.md` includes a line like `Provider: claude (native OTEL)`

## MODIFIED Requirements

### Requirement: OTEL env injection at QueueManager spawn

The hub SHALL inject OTEL environment variables into child processes spawned by `QueueManager` ONLY when the resolved provider adapter declares `capabilities.nativeOtelEnv === true` AND `pipelineTelemetryEnabled === true` for the project. Providers with native OTEL support (Claude today) receive the standard variable set:

- `CLAUDE_CODE_ENABLE_TELEMETRY=1` (Claude only; other native-OTEL providers MAY require a different variable name as declared by the adapter)
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<hubPort>/otlp`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
- `OTEL_METRICS_EXPORTER=otlp`
- `OTEL_LOGS_EXPORTER=otlp`
- `OTEL_TRACES_EXPORTER=otlp`
- `OTEL_RESOURCE_ATTRIBUTES=specrails.job_id=<jobId>,specrails.project_id=<projectId>`

Providers with `capabilities.nativeOtelEnv === false` MUST NOT receive these variables. Their telemetry signals are emitted via the synthetic OTEL bridge (see ADDED Requirement above). Injection MUST NOT apply to `ChatManager` or `SetupManager` spawns for any provider.

#### Scenario: Claude job with telemetry ON receives the env vars
- **WHEN** `QueueManager` spawns `claude` for a job in a project with telemetry ON
- **THEN** the child process environment contains all OTEL variables listed above with the correct `jobId` and `projectId` in `OTEL_RESOURCE_ATTRIBUTES`

#### Scenario: Codex job with telemetry ON receives NO env vars
- **WHEN** `QueueManager` spawns `codex` for a job in a project with telemetry ON
- **THEN** the child process environment contains NONE of the OTEL variables
- **AND** the hub starts the synthetic bridge to read the JSONL stream

#### Scenario: Telemetry OFF: no env vars, no bridge
- **WHEN** `QueueManager` spawns any provider for a project with telemetry OFF
- **THEN** the child process environment contains none of the OTEL variables
- **AND** the synthetic bridge is not started

#### Scenario: ChatManager is not instrumented (any provider)
- **WHEN** `ChatManager` spawns any provider for a project with telemetry ON
- **THEN** no OTEL variables are injected into that spawn
- **AND** the synthetic bridge is not started for that conversation

#### Scenario: SetupManager is not instrumented (any provider)
- **WHEN** `SetupManager` spawns any provider for a project with telemetry ON
- **THEN** no OTEL variables are injected into that spawn
- **AND** the synthetic bridge is not started for that setup run
