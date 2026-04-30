# terminal-settings Specification

## Purpose
Persist hub-wide and per-project terminal settings, expose REST endpoints for reading and updating them, and define hot-reload semantics so live sessions and newly spawned PTYs apply changes correctly.

## Requirements

### Requirement: Hub-wide and per-project terminal settings schema
The system SHALL persist terminal settings in two layers: hub-wide defaults in `~/.specrails/hub.sqlite` (as reserved keys in the existing `hub_settings` key/value table) and per-project overrides in each project's `jobs.sqlite` (in a new `terminal_settings_override` key/value table). The hub layer MUST provide a non-null value for every setting (seeded on first migration). The per-project layer MUST allow each setting to be absent, where absence means "inherit hub default". Settings include: `fontFamily` (string), `fontSize` (integer 8-32), `renderMode` (`"auto" | "canvas" | "webgl"`), `copyOnSelect` (boolean), `shellIntegrationEnabled` (boolean), `notifyOnCompletion` (boolean), `imageRendering` (boolean), `longCommandThresholdMs` (integer ≥ 1000).

#### Scenario: Hub defaults seed on first migration
- **WHEN** the new hub-db migration runs for the first time on an existing install
- **THEN** `hub_settings` contains rows under keys `terminal.fontFamily`, `terminal.fontSize`, `terminal.renderMode`, `terminal.copyOnSelect`, `terminal.shellIntegrationEnabled`, `terminal.notifyOnCompletion`, `terminal.imageRendering`, `terminal.longCommandThresholdMs` with values: `"DM Mono, JetBrains Mono, ui-monospace, Menlo, monospace"`, `"12"`, `"auto"`, `"false"`, `"true"`, `"true"`, `"true"`, `"60000"`

#### Scenario: Per-project override is empty until first override
- **WHEN** a project has never had its terminal settings overridden
- **THEN** the project's `terminal_settings_override` table is empty
- **AND** `resolveTerminalSettings(projectId)` returns the hub defaults for every field

#### Scenario: Override absent falls back to hub
- **WHEN** a project's `terminal_settings_override` table contains only a row for `terminal.renderMode = "canvas"`
- **THEN** `resolveTerminalSettings(projectId)` returns the hub `fontSize` and the project-specific `renderMode = "canvas"`

#### Scenario: Out-of-range fontSize rejected
- **WHEN** a PATCH request attempts to set `fontSize = 4`
- **THEN** the server responds 400 with a validation error
- **AND** the existing value is unchanged

### Requirement: Terminal settings REST endpoints
The server SHALL expose `GET /api/hub/terminal-settings` returning the full hub defaults and `PATCH /api/hub/terminal-settings` accepting a partial update. Per-project endpoints SHALL be `GET /api/projects/:projectId/terminal-settings` returning `{ resolved, override, hubDefaults }` and `PATCH /api/projects/:projectId/terminal-settings` accepting a partial update of the override row, where setting any field to JSON `null` MUST clear that override field.

#### Scenario: GET hub returns defaults
- **WHEN** the client GETs `/api/hub/terminal-settings`
- **THEN** the response body is the full hub-defaults object with all fields populated

#### Scenario: PATCH project sets override
- **WHEN** the client PATCHes `/api/projects/abc/terminal-settings` with `{ "fontSize": 14 }`
- **THEN** the project's `terminal_settings_override` table contains a row `terminal.fontSize = "14"`
- **AND** subsequent `resolveTerminalSettings("abc")` returns `fontSize = 14`

#### Scenario: PATCH project null clears override
- **WHEN** the client PATCHes `/api/projects/abc/terminal-settings` with `{ "fontSize": null }`
- **THEN** any row for `terminal.fontSize` in the project's `terminal_settings_override` table is deleted
- **AND** `resolveTerminalSettings("abc")` returns the hub default for `fontSize`

#### Scenario: GET project returns three layers
- **WHEN** the client GETs `/api/projects/abc/terminal-settings`
- **THEN** the response body has shape `{ resolved: TerminalSettings, override: PartialTerminalSettings, hubDefaults: TerminalSettings }`
- **AND** `resolved` matches the result of `resolveTerminalSettings("abc")`

### Requirement: Hot-reload semantics
Changes to `fontFamily`, `fontSize`, and `copyOnSelect` SHALL apply to all live terminal sessions of the affected scope (hub change → all projects' live sessions; project change → that project's live sessions only) without re-spawn. Changes to `renderMode`, `shellIntegrationEnabled`, and `imageRendering` SHALL apply only to the *next* spawned PTY session; live sessions retain their boot-time configuration. Changes to `notifyOnCompletion` and `longCommandThresholdMs` SHALL apply immediately to all live sessions.

#### Scenario: Font size hot-reloads existing sessions
- **WHEN** the user changes hub `fontSize` from 12 to 14 with three live sessions across two projects
- **THEN** all three sessions visually re-render at 14px within one animation frame
- **AND** no PTY is killed or re-spawned

#### Scenario: Render mode does not hot-reload
- **WHEN** the user toggles `renderMode` from `"auto"` to `"canvas"` while a WebGL-rendering session is open
- **THEN** the live session continues to use the WebGL renderer
- **AND** a newly created session uses the canvas renderer

#### Scenario: Shell-integration toggle does not affect live sessions
- **WHEN** the user disables shell integration while a session has an active shim
- **THEN** the live session keeps emitting OSC marks and the panel keeps tracking them
- **AND** the next spawned session has no shim
