## ADDED Requirements

### Requirement: Server runs exclusively in hub mode
The server SHALL run in hub mode unconditionally. The `--legacy` CLI flag and the `SPECRAILS_LEGACY` environment variable SHALL have no effect on mode selection. The `--project` CLI argument SHALL NOT be accepted.

#### Scenario: Server start without flags
- **WHEN** `node server/index.ts` (or the bundled sidecar) is invoked with no mode-related arguments
- **THEN** the server initialises `ProjectRegistry`, mounts `/api/hub/*`, mounts `/api/projects/:projectId/*`, mounts `/otlp`, runs telemetry compaction, and listens on the configured port

#### Scenario: Server start with legacy flag is ignored
- **WHEN** the server is invoked with `--legacy` or `SPECRAILS_LEGACY=1`
- **THEN** hub mode starts as if the flag were absent
- **AND** the legacy single-project SQLite at `cwd/data/jobs.sqlite` is NOT created

#### Scenario: Project name resolution helper is absent
- **WHEN** the codebase is searched for `resolveProjectName`
- **THEN** the helper does not exist and no caller depends on it

### Requirement: Health endpoint reports hub mode
The `GET /api/health` endpoint SHALL return a JSON object whose `mode` field is the constant string `"hub"`. Other fields (`status`, `version`, `uptime`, `projects`) retain their existing semantics.

#### Scenario: Health probe
- **WHEN** a client issues `GET /api/health`
- **THEN** the response body contains `"mode": "hub"`
- **AND** `projects` reflects the count returned by `ProjectRegistry.listContexts().length`

### Requirement: Legacy single-project routes are not registered
The server SHALL NOT register the following root-level routes: `POST /hooks/events`, `POST /api/spawn`, `GET /api/state`, `GET /api/jobs`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`, `DELETE /api/jobs`, `GET /api/queue`, `POST /api/queue/pause`, `POST /api/queue/resume`, `PUT /api/queue/reorder`, `GET /api/stats`, `GET /api/analytics`, `GET /api/config`, `POST /api/config`, `GET /api/issues`, `GET|POST|DELETE|PATCH /api/chat/*`, `GET|POST|DELETE /api/propose/*`. All equivalent operations SHALL be reachable only under `/api/projects/:projectId/*` via `project-router`.

#### Scenario: Legacy spawn endpoint is unreachable
- **WHEN** a client issues `POST /api/spawn` against a running hub server
- **THEN** the response status is `404`

#### Scenario: Legacy hooks endpoint is unreachable
- **WHEN** a client issues `POST /hooks/events` (without `/api/projects/:projectId` prefix)
- **THEN** the response status is `410 Gone` with a body directing the caller to `/api/projects/:projectId/hooks/events`

#### Scenario: Per-project routes remain available
- **WHEN** a client issues `POST /api/projects/<id>/spawn` for a registered project
- **THEN** the request is handled by `project-router` and a job is enqueued exactly as before this change

### Requirement: Server holds no top-level legacy manager instances
The server entry point SHALL NOT instantiate `QueueManager`, `ChatManager`, or `ProposalManager` at module scope. All manager instances SHALL be owned by `ProjectContext` records inside `ProjectRegistry`.

#### Scenario: Module-level legacy state is absent
- **WHEN** `server/index.ts` is read
- **THEN** there is no `_legacyDb` variable, no top-level `new QueueManager(...)`, no top-level `new ChatManager(...)`, and no top-level `new ProposalManager(...)`

### Requirement: Client mounts hub provider unconditionally
The React client SHALL render `<HubProvider><HubApp/></HubProvider>` as the only top-level app shell. The client SHALL NOT issue a `GET /api/hub/state` probe to determine its mode and SHALL NOT render any legacy layout (`RootLayout`, `Navbar`, `LegacyOsNotifications`, `LegacyKeyboardShortcuts`).

#### Scenario: Client startup makes no mode-detection request
- **WHEN** the client app boots (web or Tauri)
- **THEN** no request is made to `GET /api/hub/state` for mode detection
- **AND** `<HubProvider>` is the first React provider rendered after `<SharedWebSocketProvider>`

#### Scenario: Legacy components are absent from the bundle
- **WHEN** the client codebase is searched for `RootLayout`, `Navbar.tsx`, `LegacyOsNotifications`, or `LegacyKeyboardShortcuts`
- **THEN** none of these symbols exist as exported components or imported references in production code

### Requirement: API base helper requires an active project
The `getApiBase()` function in `client/src/lib/api.ts` SHALL return `${API_ORIGIN}/api/projects/<activeProjectId>` whenever an active project is set. The module-level `_isHubMode` flag and the `setHubMode()` helper SHALL be removed. Only an active-project setter SHALL remain.

#### Scenario: API base with active project
- **WHEN** the active project ID is set to `"abc123"` and `getApiBase()` is called
- **THEN** the function returns `${API_ORIGIN}/api/projects/abc123`

#### Scenario: API base without active project
- **WHEN** no active project ID has been set and `getApiBase()` is called
- **THEN** the function throws an error indicating no active project is set
- **AND** callers that legitimately operate without a project context (e.g., `/api/hub/*`, `/api/health`) use `API_ORIGIN` directly instead of `getApiBase()`

### Requirement: Documentation reflects hub-only operation
Project documentation (`CLAUDE.md`, `.claude/rules/client.md`, `.claude/rules/server.md`, and any user-facing README) SHALL NOT reference `--legacy`, `SPECRAILS_LEGACY`, "single-project mode", or "legacy mode" as a supported runtime configuration.

#### Scenario: Docs are clean of legacy mode references
- **WHEN** the documentation files are searched for `--legacy`, `SPECRAILS_LEGACY`, `single-project mode`, or `legacy mode`
- **THEN** no matches are found in user-facing or contributor-facing docs (matches in `setup-manager`, `profile-manager`, `profiles-router`, `queue-manager`, or `rails-router` referring to legacy specrails-core installations or legacy profile fallback are out of scope and may remain)
