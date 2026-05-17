## ADDED Requirements

### Requirement: Explore turns honor per-conversation context scope
Every Explore conversation SHALL carry a `contextScope: { specrails: boolean, openspec: boolean, full: boolean, mcp: boolean }` record set at launch (from the Add Spec modal) and persisted on the `chat_conversations` row. Each turn spawn MUST consult this record and:
- When `specrails=true`, prepend `<project>/.specrails/specs/**/*.md` content to the system prompt under a section labelled `## Specrails Specs` (capped at 30k tokens, truncated with `(truncated)` marker).
- When `openspec=true`, prepend `<project>/openspec/specs/**/spec.md` content under `## OpenSpec Specs` (same cap).
- When `full=true`, pass `--allowedTools Read,Grep,Glob` (Bash excluded by default). When `full=false`, pass `--disallowedTools Read,Grep,Glob,Bash`. The two flags MUST NOT both be passed; a falsy `full` selects disallow.
- When `specrails=true` or `openspec=true` AND `full=false`, the spawn MUST additionally allow Read on the specific spec directory paths via `--allowedTools` so the model can re-read the concatenated specs if it asks. The remaining file system remains blocked.

#### Scenario: Specs concat appears under labelled sections
- **WHEN** the first Explore turn fires with `contextScope: { specrails: true, openspec: true, full: false, mcp: false }`
- **THEN** the system prompt contains a `## Specrails Specs` section followed by spec contents
- **AND** the system prompt contains a `## OpenSpec Specs` section followed by openspec contents
- **AND** the spawn includes `--disallowedTools Read,Grep,Glob,Bash` for non-spec paths
- **AND** Read on the spec directories is permitted via `--allowedTools`

#### Scenario: Full ON opens read tools
- **WHEN** an Explore turn fires with `full=true`
- **THEN** the spawn includes `--allowedTools Read,Grep,Glob`
- **AND** Bash is not in the allowed list

#### Scenario: Full OFF closes read tools
- **WHEN** an Explore turn fires with `full=false` and both spec toggles OFF
- **THEN** the spawn includes `--disallowedTools Read,Grep,Glob,Bash`
- **AND** no allow-list is present for those tools

#### Scenario: 30k cap on spec concat
- **WHEN** the combined specrails spec content exceeds 30k tokens
- **THEN** the prompt section is truncated to fit
- **AND** ends with the literal marker `(truncated)`

### Requirement: Explore conversation persists its contextScope
The `chat_conversations` table SHALL gain a `context_scope` text column (JSON) for rows where `kind='explore'`. The column MUST be populated at conversation creation from the Add Spec modal payload and MUST NOT change for the lifetime of the conversation. Resumed conversations (via `--resume`) MUST re-read this stored scope on every turn.

#### Scenario: Scope persists across resume
- **GIVEN** an Explore conversation created with `context_scope = { specrails: true, openspec: false, full: false, mcp: true }`
- **WHEN** the conversation is minimized and later resumed via a new spawn with `--resume`
- **THEN** the resumed spawn reads the stored `context_scope` and applies the same flags

#### Scenario: Scope is immutable
- **WHEN** a user changes the toggles in a new Add Spec modal while an older Explore conversation is active
- **THEN** the older conversation's spawns continue to use its original scope

## MODIFIED Requirements

### Requirement: Explore turns spawn from a hub-managed cwd by default

Every Explore conversation turn (chat conversations with `kind='explore'`) SHALL spawn `claude` with `cwd` selected by the conversation's `contextScope.mcp` flag. When `contextScope.mcp` is `true` the spawn cwd MUST be `<project.path>`; otherwise it MUST be `~/.specrails/projects/<slug>/explore-cwd/`. The hub-managed cwd MUST contain a hub-owned `CLAUDE.md` and a symlink `./project` (junction on Windows) pointing at the project's absolute path. The user's `<project>/CLAUDE.md` MUST NOT be modified, moved, deleted, or referenced by the spawn cwd in any way. The conversation's stored `contextScope.mcp` MUST default at creation time to the current value of the project-wide `explore_mcp_enabled` setting unless the Add Spec modal supplied a per-spec override.

#### Scenario: contextScope.mcp false uses hub-managed cwd
- **WHEN** an Explore turn fires and the conversation's `contextScope.mcp` is `false`
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `CLAUDE.md` file
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: contextScope.mcp true uses project cwd
- **WHEN** an Explore turn fires and the conversation's `contextScope.mcp` is `true`
- **THEN** `claude` is spawned with `cwd` equal to `<project.path>`
- **AND** the hub-managed `explore-cwd/` directory is not used for that turn

#### Scenario: Project CLAUDE.md is never touched
- **WHEN** an Explore conversation is created, run, resumed, minimized, restored, or closed
- **THEN** the file `<project.path>/CLAUDE.md` is not modified, moved, or deleted by the hub
- **AND** the hub-managed `explore-cwd/CLAUDE.md` is a separate file with hub-owned content

#### Scenario: Default scope.mcp follows the global setting
- **WHEN** a new Explore conversation is created from the Add Spec modal with the MCP toggle left at its default
- **AND** the project's `explore_mcp_enabled` is `true`
- **THEN** the conversation's stored `contextScope.mcp` is `true`

### Requirement: Per-project Use-MCPs-in-Explore toggle defaults OFF

The hub SHALL persist a per-project boolean setting `explore_mcp_enabled`, default `false`, exposed via `GET /api/projects/:projectId/explore-mcp-enabled` and `PATCH /api/projects/:projectId/explore-mcp-enabled`. The PATCH endpoint MUST accept `{ enabled: boolean }` and reject other payloads with HTTP 400. This setting SHALL serve as the default boot value for the `External tools (MCPs)` toggle in the Add Spec modal when no per-project persisted `add_spec_context_scope_last` exists. The setting MUST NOT be mutated by the Add Spec modal — per-spec overrides are recorded only on the conversation's `contextScope` and on `add_spec_context_scope_last`. Existing Explore conversations consult their own stored `contextScope.mcp` at every turn, not the global setting.

#### Scenario: Default value is false
- **WHEN** a fresh project is registered and `GET /api/projects/:id/explore-mcp-enabled` is called before any user interaction
- **THEN** the response is `{ enabled: false }`

#### Scenario: Setting drives default boot, not active turns
- **GIVEN** the global `explore_mcp_enabled=true`
- **WHEN** the user opens a fresh Add Spec modal in that project
- **THEN** the modal's `External tools (MCPs)` toggle boots ON
- **AND** changing the modal toggle does NOT change the value returned by `GET /api/projects/:id/explore-mcp-enabled`

#### Scenario: Active conversation ignores later global changes
- **GIVEN** an active Explore conversation with stored `contextScope.mcp=false`
- **WHEN** the global `explore_mcp_enabled` is PATCHed to `true`
- **THEN** the next turn of that conversation still spawns from the hub-managed cwd

#### Scenario: Invalid payload rejected
- **WHEN** the client PATCHes `{ enabled: "yes" }` or any non-boolean
- **THEN** the server responds 400
- **AND** the stored value is unchanged
