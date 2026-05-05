## ADDED Requirements

### Requirement: Pre-spawn plugin resolution in QueueManager
Before spawning a Claude CLI process for a rail job, `QueueManager` MUST resolve the project's installed plugins by reading `<project>/.specrails/plugins/state.json` and invoking `PluginManager.verify` for each entry. Resolution MUST run after the existing profile resolution and before the spawn. Resolution MUST NOT mutate any project file.

#### Scenario: Project with no plugins resolves to empty active list
- **WHEN** a rail job is enqueued for a project whose `state.json` is missing or empty
- **THEN** plugin resolution returns `{ active: [], degraded: [] }` and the spawn proceeds with no plugin-specific changes

#### Scenario: Healthy plugin appears in active list
- **WHEN** Serena is installed and `verify` resolves `{ ok: true }` within the timeout
- **THEN** plugin resolution returns `active: [{ name: "serena", version: "<v>" }]`

### Requirement: Healthcheck is non-blocking
A failed or timed-out plugin healthcheck MUST NOT cancel or fail the rail spawn. The plugin MUST be moved from `active` to `degraded` and the spawn MUST proceed.

#### Scenario: Verify timeout downgrades but does not block
- **GIVEN** Serena is installed and its `verify` exceeds the configured timeout (default 2000ms)
- **WHEN** the rail job is enqueued
- **THEN** plugin resolution returns `degraded: [{ name: "serena", reason: "verify-timeout" }]` and the spawn proceeds normally

#### Scenario: Verify error downgrades but does not block
- **GIVEN** Serena is installed but `uv` has been removed from PATH
- **WHEN** the rail job is enqueued
- **THEN** plugin resolution returns `degraded: [{ name: "serena", reason: "<actual reason>" }]` and the spawn proceeds normally

### Requirement: Per-job plugin snapshot
For every rail spawn that resolves at least one plugin (active or degraded), `QueueManager` MUST write a snapshot file at `~/.specrails/projects/<slug>/jobs/<jobId>/plugins.json` with mode `0o400`. The snapshot MUST contain `{ jobId, projectId, capturedAt, active: [{ name, version }], degraded: [{ name, reason }] }` and MUST be written before the spawn.

#### Scenario: Snapshot exists with chmod 400 after spawn
- **WHEN** a rail job spawns with Serena active
- **THEN** the snapshot file exists at the expected path, has mode `0o400`, and contains Serena under `active`

#### Scenario: No snapshot when no plugins resolved
- **WHEN** a rail job spawns for a project with no installed plugins
- **THEN** no `plugins.json` file is written for that job

### Requirement: Environment and OTEL injection
When a rail job spawns with at least one plugin in `active`, `QueueManager` MUST set the environment variable `SPECRAILS_PLUGINS_ACTIVE` to a comma-separated list of active plugin names and `SPECRAILS_PLUGINS_SNAPSHOT` to the absolute path of the snapshot file. The OTEL resource attributes for that job MUST include `specrails.plugins.active` (string array of names) and, when applicable, `specrails.plugins.degraded` (string array of names). Versions MUST be exposed under `specrails.plugins.versions` as a JSON-serialised string keyed by name.

#### Scenario: Active plugins surface in env vars
- **WHEN** a rail spawns with Serena active
- **THEN** the spawned process's environment contains `SPECRAILS_PLUGINS_ACTIVE=serena` and `SPECRAILS_PLUGINS_SNAPSHOT=<absolute path>`

#### Scenario: OTEL attrs include both active and degraded
- **WHEN** a rail spawns with Serena active and a hypothetical second plugin degraded
- **THEN** OTEL resource attrs include `specrails.plugins.active = ["serena"]` and `specrails.plugins.degraded = ["<other>"]`

### Requirement: ChatManager inherits without snapshot
`ChatManager` MUST NOT write a per-session plugin snapshot and MUST NOT set `SPECRAILS_PLUGINS_*` env vars. Plugins reach interactive chat sessions only via the project's `.mcp.json`, which the Claude CLI reads at process startup using the spawn `cwd`.

#### Scenario: Chat spawn has no plugin env vars
- **WHEN** a chat session is started for a project with Serena installed
- **THEN** the spawned chat process's environment does not contain `SPECRAILS_PLUGINS_ACTIVE` or `SPECRAILS_PLUGINS_SNAPSHOT`

#### Scenario: Chat session inherits MCP config from cwd
- **GIVEN** Serena is installed and present in `.mcp.json`
- **WHEN** a chat session spawns
- **THEN** the Claude CLI loads `serena` from `.mcp.json` via the spawn `cwd` without any hub-side plugin code path running

### Requirement: SetupManager ignores plugins
`SetupManager` MUST NOT read plugin state, run healthchecks, or inject plugin env vars during the project setup wizard. The wizard remains entirely independent of the plugin system.

#### Scenario: Setup wizard is plugin-agnostic
- **WHEN** a project setup wizard runs
- **THEN** no `PluginManager` method is invoked by `SetupManager` and no plugin snapshot is written

### Requirement: Diagnostic ZIP includes plugin snapshot
`telemetry-export.ts` MUST include the per-job `plugins.json` snapshot in the diagnostic ZIP whenever the snapshot exists for that job, and MUST mention installed/degraded plugins in `summary.md`.

#### Scenario: ZIP contains plugins.json when snapshot exists
- **GIVEN** a rail job ran with Serena active and its snapshot exists
- **WHEN** the user exports the diagnostic ZIP for that job
- **THEN** the ZIP archive contains `plugins.json` with the snapshot contents and `summary.md` mentions Serena

#### Scenario: ZIP omits plugins.json when no snapshot
- **GIVEN** a rail job ran for a project with no plugins
- **WHEN** the user exports the diagnostic ZIP for that job
- **THEN** the ZIP archive does not contain `plugins.json` and `summary.md` does not reference any plugin

### Requirement: WebSocket events for plugin lifecycle
The hub SHALL broadcast project-scoped WebSocket events on plugin lifecycle transitions: `plugin.installed`, `plugin.uninstalled`, `plugin.health_changed`, and `plugin.degraded`. Every event MUST include `projectId` and the plugin `name`. `plugin.degraded` MUST additionally include `reason` and, when emitted from a rail spawn path, the related `jobId`.

#### Scenario: install emits plugin.installed
- **WHEN** a plugin install completes successfully
- **THEN** the hub broadcasts `{ type: "plugin.installed", projectId, name, version }`

#### Scenario: degraded during rail spawn carries jobId
- **WHEN** a plugin is degraded during a rail's pre-spawn healthcheck
- **THEN** the hub broadcasts `{ type: "plugin.degraded", projectId, name, reason, jobId }`

### Requirement: Snapshot atomicity vs concurrent install
A user-driven plugin install or uninstall MUST NOT corrupt an in-flight rail's behavior. The rail's snapshot, taken before spawn, MUST be the source of truth for that job; subsequent state changes MUST NOT be reflected back into already-running jobs.

#### Scenario: Mid-job uninstall does not affect running job
- **GIVEN** a rail job spawned with Serena in its snapshot
- **WHEN** the user uninstalls Serena while that job is still running
- **THEN** the running job continues with the MCP config it loaded at spawn time and its `plugins.json` snapshot remains untouched

#### Scenario: Next job after uninstall reflects new state
- **GIVEN** Serena was uninstalled while a previous job was running
- **WHEN** a new rail job is enqueued for the same project
- **THEN** the new job's snapshot does not contain Serena and `SPECRAILS_PLUGINS_ACTIVE` does not include it
