## MODIFIED Requirements

### Requirement: Explore turns spawn from a hub-managed cwd by default

Every Explore conversation turn (chat conversations with `kind='explore'`) SHALL spawn the project's resolved provider CLI with `cwd = ~/.specrails/projects/<slug>/explore-cwd/` UNLESS the per-project `explore_mcp_enabled` setting is `true`. The hub-managed cwd MUST contain a hub-owned file named `adapter.instructionsFilename` (e.g. `CLAUDE.md` for claude projects, `AGENTS.md` for codex projects) and a symlink `./project` (junction on Windows) pointing at the project's absolute path. The user's `<project>/<adapter.instructionsFilename>` MUST NOT be modified, moved, deleted, or referenced by the spawn cwd in any way.

#### Scenario: Default Claude Explore turn uses the hub-managed cwd
- **WHEN** an Explore conversation on a claude project sends its first turn and `explore_mcp_enabled` is unset or `false`
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `CLAUDE.md` file
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: Default Codex Explore turn uses the hub-managed cwd with AGENTS.md
- **WHEN** an Explore conversation on a codex project sends its first turn and `explore_mcp_enabled` is unset or `false`
- **THEN** `codex` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `AGENTS.md` file (not `CLAUDE.md`)
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: Toggle ON falls back to legacy spawn cwd
- **WHEN** an Explore turn is sent and `explore_mcp_enabled` is `true`
- **THEN** the provider CLI is spawned with `cwd` equal to `<project.path>`
- **AND** the hub-managed `explore-cwd/` directory is not used for that turn

#### Scenario: Project instructions file is never touched
- **WHEN** an Explore conversation is created, run, resumed, minimized, restored, or closed (for any provider)
- **THEN** the file `<project.path>/<adapter.instructionsFilename>` is not modified, moved, or deleted by the hub
- **AND** the hub-managed `explore-cwd/<adapter.instructionsFilename>` is a separate file with hub-owned content

### Requirement: Explore-cwd lifecycle is hub-managed

The hub SHALL ensure the per-project `explore-cwd/` directory exists, contains an up-to-date hub-owned instructions file matching `adapter.instructionsFilename`, and exposes a `./project` link to the project path before any Explore turn spawns from it. The directory MUST be created lazily on first use rather than eagerly at server start. When a project is removed via `ProjectRegistry.removeProject`, the directory MUST be removed recursively (the `./project` link MUST be unlinked, not followed). When the hub version changes, the embedded instructions content MUST be re-materialised on next use so the on-disk file matches the embedded template. The symlink MUST be recreated when the project's path has changed since last use. When the project's provider has changed since the directory was last materialised, the previous instructions file MUST be removed and the new one written before the next spawn (this is a defensive case since provider is immutable post-creation, but the lifecycle code MUST handle the edge nonetheless).

#### Scenario: First Explore turn materialises the cwd (Claude)
- **WHEN** a claude project sends its first ever Explore turn
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` is created
- **AND** `CLAUDE.md` is written from the embedded template
- **AND** `project` link is created pointing at `<project.path>`

#### Scenario: First Explore turn materialises the cwd (Codex)
- **WHEN** a codex project sends its first ever Explore turn
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` is created
- **AND** `AGENTS.md` is written from the embedded codex-flavoured template
- **AND** `project` link is created pointing at `<project.path>`

#### Scenario: Project removal cleans up
- **WHEN** the project is removed from the hub registry
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` no longer exists
- **AND** any active Explore spawn for that project is terminated

#### Scenario: Hub version bump refreshes the template
- **WHEN** the hub starts after an upgrade and the next Explore turn fires
- **THEN** the explore-cwd's instructions file is rewritten from the new embedded template (matching the project's provider)
- **AND** the rewrite happens before the spawn

#### Scenario: Project path change triggers symlink recreation
- **WHEN** the registered project path differs from the symlink target on the next Explore turn
- **THEN** the existing `project` link is replaced with a fresh link to the current path
- **AND** the spawn proceeds with the corrected link in place

### Requirement: Explore turns kept warm via session resume

Each Explore turn after the first SHALL be respawned with the provider adapter's `chat-resume` action and the captured session id as input. For providers where `capabilities.nativeResume === true`, the adapter MUST construct the resume argv natively (e.g. `--resume <session_id>` for claude, `exec resume <thread_id>` for codex). The hub does not maintain a persistent child process across turns; instead, deterministic system prompt (per the byte-stability requirement) plus consistent `cwd` per turn keep the model's prompt cache warm where the provider supports it.

For providers where `capabilities.nativeResume === false` (none in v1 of this change, but the contract MUST allow such providers without code changes), the adapter MUST fold the prior conversation history into a synthesised prompt — the hub itself does not need to know how this is achieved.

#### Scenario: Claude second turn uses --resume
- **GIVEN** an Explore conversation on a claude project whose first turn captured `session_id=S`
- **WHEN** the user sends a second message
- **THEN** `claudeAdapter.buildArgs('chat-resume', { sessionId: 'S', ... })` is called
- **AND** the returned argv includes `--resume S`

#### Scenario: Codex second turn uses exec resume
- **GIVEN** an Explore conversation on a codex project whose first turn captured `thread_id=T`
- **WHEN** the user sends a second message
- **THEN** `codexAdapter.buildArgs('chat-resume', { sessionId: 'T', ... })` is called
- **AND** the returned argv begins with `['exec', 'resume', '--json', 'T', ...]`
- **AND** the codex spawn produces an `item.completed` event whose context includes the prior turn

#### Scenario: Resume is preserved across minimize and restore (any provider)
- **GIVEN** an Explore conversation with a captured `session_id` that was minimized and later restored
- **WHEN** the user sends the next message after restore
- **THEN** the adapter's `chat-resume` action is invoked with the preserved session id
- **AND** the conversation row's `session_id` value is unchanged

#### Scenario: Codex thread_id captured from first turn
- **WHEN** the first codex Explore turn emits a `thread.started` event with `thread_id=T`
- **THEN** the adapter's `parseStreamLine` returns `{ kind: 'session-started', sessionId: 'T' }`
- **AND** the conversation row's `session_id` is updated to `T`
- **AND** no synthetic `codex-<convId>-<timestamp>` id is generated

### Requirement: Crash recovery auto-respawns once

If a provider's child process for an in-flight Explore turn exits before emitting a `result` event (as defined by the adapter's `parseStreamLine`), the hub SHALL respawn the same turn exactly once with the same prompt and the captured session id passed through the adapter's `chat-resume` action. If the second attempt also exits without a `result` event, the hub MUST emit a `chat_error` for that conversation with a recognisable `crashed` reason. A successful turn SHALL reset the per-conversation crash counter to zero. The auto-respawn MUST NOT fire if the user has explicitly interrupted the turn (Stop button) before the crash occurs.

#### Scenario: First crash transparently respawns (any provider)
- **GIVEN** an Explore turn whose child process exits non-zero before emitting a `result` event
- **WHEN** no user interrupt was issued
- **THEN** a second provider spawn is started for the same turn via `adapter.buildArgs('chat-resume', { sessionId, ... })`
- **AND** the user sees streaming continue without an error message

#### Scenario: First crash respawn falls back to chat-turn when no session id was captured
- **GIVEN** an Explore turn that crashed before any `session-started` event was emitted
- **WHEN** the auto-respawn fires
- **THEN** the adapter's `chat-turn` action is used (not `chat-resume`)
- **AND** the spawned process is a fresh, non-resumed conversation

#### Scenario: Second crash surfaces an error
- **WHEN** the auto-respawned attempt also exits before `result`
- **THEN** a `chat_error` WS event is broadcast for the conversation with reason `crashed`
- **AND** no third spawn is attempted

#### Scenario: Successful turn resets the counter
- **GIVEN** a conversation whose crash counter is 1 from a previous transient crash
- **WHEN** the next turn completes successfully
- **THEN** the next-future crash will trigger a fresh single auto-respawn

#### Scenario: User interrupt skips auto-respawn
- **GIVEN** an in-flight turn that the user has cancelled via Stop
- **WHEN** the child process exits non-zero
- **THEN** no auto-respawn occurs
- **AND** no `chat_error crashed` event is emitted (the existing cancel pathway handles UX)

### Requirement: Explore overlay shows status pills until first text delta

The Explore overlay SHALL render a status pill area immediately when the user submits a turn, displaying a sequence of states derived from streamed events as classified by the adapter's `parseStreamLine`. The pills MUST disappear as soon as the first `kind: 'text-delta'` event of the assistant turn is observed. Each individual pill MUST be visible for at least 150 milliseconds before being replaced, to avoid flicker. A skeleton bubble MUST be visible from the moment the user submits the message, before any WebSocket round-trip.

#### Scenario: Pill stages map to events (Claude)
- **WHEN** the user submits an Explore turn on a claude project
- **THEN** a pill labelled `Conectando…` appears within 16 ms of submission
- **AND** when the conversation receives a `system` event (which the adapter classifies into a session-started or other kind) the pill changes to `Pensando…`
- **AND** when any `tool_use` event arrives during the same turn the pill changes to `Consultando código…`
- **AND** the pill area disappears as soon as the first `text-delta` event arrives

#### Scenario: Pill stages map to events (Codex)
- **WHEN** the user submits an Explore turn on a codex project
- **THEN** a pill labelled `Conectando…` appears within 16 ms of submission
- **AND** when the conversation receives a `thread.started` event (classified by the adapter as `session-started`) the pill changes to `Pensando…`
- **AND** when any tool-use item arrives during the same turn the pill changes to `Consultando código…`
- **AND** the pill area disappears as soon as the first `text-delta` event arrives

#### Scenario: Minimum 150 ms per pill prevents flicker
- **GIVEN** a turn whose `session-started` and first `text-delta` events arrive within 50 ms of each other
- **WHEN** the `Pensando…` pill would normally show
- **THEN** the pill remains visible for at least 150 ms before being replaced or removed

#### Scenario: Skeleton appears at T+0
- **WHEN** the user clicks Send on the Explore composer
- **THEN** a skeleton assistant bubble is rendered before any server response
- **AND** the skeleton remains until either the first `text-delta` event or a terminal `chat_error` for that turn
