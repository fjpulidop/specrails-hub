# plugin-system Specification

## Purpose
TBD - created by archiving change add-plugin-system. Update Purpose after archive.
## Requirements
### Requirement: Bundled plugin registry
The app SHALL expose a typed, in-process registry of bundled plugins. Every plugin available to projects MUST be discoverable through this registry; no remote, user-installable, or dynamically-loaded plugins are permitted in v1.

#### Scenario: Listing the registry returns all bundled plugins
- **WHEN** the app starts
- **THEN** `PluginManager.listAvailable()` returns one entry per plugin bundled at build time, each carrying its full manifest

#### Scenario: Adding a new plugin requires only a registry import
- **WHEN** a developer appends a new plugin module to `server/plugins/index.ts`
- **THEN** the new plugin appears in the registry on next app start with no other code changes elsewhere

### Requirement: Plugin manifest declares ownership
Every plugin MUST declare, in its manifest, the artifacts it owns: MCP server names (`owns.mcpServers`), agent fragment file paths (`owns.agentFragments`), and any project-state config keys (`owns.configKeys`). The manifest MUST also include `name` (kebab-case unique id), `version` (semver), `description`, `whatItDoes` (bullet list for the marketplace card), and `requirements` (executable prerequisites such as `uv >= 0.1`).

#### Scenario: Manifest with overlapping ownership is rejected at startup
- **WHEN** two registered plugins claim the same `mcpServers` entry
- **THEN** the app fails fast at startup with an error naming both plugins and the conflicting key

#### Scenario: Manifest missing required fields is rejected at startup
- **WHEN** a registered plugin's manifest lacks `name`, `version`, or `owns`
- **THEN** the app fails fast at startup with a validation error pointing at the offending plugin

### Requirement: Per-project plugin state
The app SHALL persist per-project plugin state at `<project>/.specrails/plugins/state.json`. The state file MUST be a JSON object of shape `{ schemaVersion: 1, plugins: { [name]: { version, installedAt, health } } }`. The file MUST be created lazily on first install and never deleted by the app even when no plugins remain installed.

#### Scenario: Project with no plugins has no state file
- **WHEN** a project has never installed a plugin
- **THEN** `<project>/.specrails/plugins/state.json` does not exist and `PluginManager.getProjectState(projectId)` returns `{ schemaVersion: 1, plugins: {} }`

#### Scenario: State file survives uninstall of last plugin
- **WHEN** the user uninstalls the last installed plugin
- **THEN** `state.json` remains on disk with `plugins: {}`

### Requirement: Additive install/uninstall
Installing or uninstalling plugin N MUST NOT mutate any artifact owned by another plugin or by the user. All file mutations to shared artifacts (`.mcp.json`, `state.json`) MUST be surgical: read, modify only the plugin's owned keys, write atomically.

#### Scenario: Installing a second plugin preserves the first
- **GIVEN** plugin A is installed and contributed `mcpServers.serena`
- **WHEN** plugin B is installed and contributes `mcpServers.foo`
- **THEN** `.mcp.json` contains both `serena` and `foo` entries unchanged from each plugin's contribution

#### Scenario: Uninstalling a plugin preserves user-authored MCP entries
- **GIVEN** the user manually added `mcpServers.myown` to `.mcp.json` and plugin A contributed `mcpServers.serena`
- **WHEN** plugin A is uninstalled
- **THEN** `.mcp.json` still contains `myown` exactly as the user wrote it; only `serena` is removed

#### Scenario: Uninstall does not touch other plugins' agent fragments
- **GIVEN** plugin A owns `.claude/agents/custom-serena.md` and plugin B owns `.claude/agents/custom-foo.md`
- **WHEN** plugin A is uninstalled
- **THEN** `custom-foo.md` is untouched

### Requirement: Atomic, locked file mutation
All writes to `<project>/.mcp.json` and `<project>/.specrails/plugins/state.json` performed by the app MUST hold a `proper-lockfile` advisory lock for the duration of the read-modify-write and MUST replace the file via temp-file + rename so partial writes are never observable.

#### Scenario: Concurrent installs serialize correctly
- **WHEN** two installs of different plugins start within the same millisecond
- **THEN** both ultimately succeed and the final `.mcp.json` contains entries from both with no lost update

#### Scenario: Crash mid-write leaves the previous file intact
- **WHEN** the app process is killed between the temp write and the rename
- **THEN** the original `.mcp.json` remains valid JSON with its prior contents

### Requirement: Install rollback on failure
If `Plugin.install` fails or `Plugin.verify` returns `ok: false` immediately after install, the `PluginManager` MUST roll back every file mutation performed during the failed install before surfacing the error. State on disk after the rollback MUST be byte-identical to the pre-install state.

#### Scenario: Verify failure rolls back .mcp.json
- **GIVEN** plugin A's `install` succeeds but `verify` reports `ok: false`
- **WHEN** the install transaction completes
- **THEN** `.mcp.json` is restored to its pre-install contents and `state.json` does not contain plugin A

### Requirement: Healthcheck API
`PluginManager.verify(projectId, pluginName)` MUST return `{ ok, reason, checkedAt }` and MUST complete or be cancelled within a configurable timeout (default 2000ms). Healthcheck implementations are owned by each plugin and MUST be safe to invoke at any time.

#### Scenario: Verify timeout reports degraded
- **WHEN** a plugin's `verify` runs longer than the timeout
- **THEN** `PluginManager.verify` resolves with `{ ok: false, reason: "verify-timeout", ... }` and does not throw

#### Scenario: Healthy plugin returns ok
- **WHEN** Serena is installed and `uvx serena --version` exits 0 within the timeout
- **THEN** `PluginManager.verify(projectId, "serena")` resolves with `{ ok: true }`

### Requirement: Orphan handling
When a project's `state.json` references a plugin that is no longer in the bundled registry, the app MUST mark that entry as `orphan: true` in API responses but MUST NOT delete it silently. The user MUST be offered an explicit "remove orphan" action.

#### Scenario: Removed plugin shows as orphan
- **GIVEN** state.json contains plugin "old-thing" and the registry does not
- **WHEN** the client fetches the integrations list for that project
- **THEN** the response includes one card with `status: "orphan"` and a separate uninstall path

### Requirement: REST API surface
The app SHALL expose plugin operations under `/api/projects/:projectId/plugins`:
- `GET /` — list catalog with per-plugin status (`installed | not-installed | orphan | degraded`).
- `GET /:name/preview-install` — return a structured diff describing every file the install would create or modify.
- `POST /:name/install` — perform install; streams progress over the existing project WebSocket using `plugin.installed` and progress events.
- `DELETE /:name` — uninstall; emits `plugin.uninstalled`.
- `GET /:name/health` — re-run verify on demand.

#### Scenario: Preview-install returns diff before any mutation
- **WHEN** the client calls `GET /api/projects/:id/plugins/serena/preview-install`
- **THEN** the response describes the planned changes and the project filesystem is not modified

#### Scenario: Install on missing plugin returns 404
- **WHEN** the client calls `POST /api/projects/:id/plugins/does-not-exist/install`
- **THEN** the server returns HTTP 404 with an error body naming the unknown plugin

### Requirement: Per-project isolation
Plugin state, install effects, and lifecycle MUST be strictly per-project. Installing a plugin in project A MUST have no effect on project B, even when both projects target the same filesystem path is impossible by registry construction (each project has a unique path).

#### Scenario: Install in project A leaves project B untouched
- **GIVEN** projects A and B exist with no plugins installed
- **WHEN** the user installs Serena in project A
- **THEN** project B's `.mcp.json` and `.specrails/plugins/state.json` are unchanged

