## ADDED Requirements

### Requirement: Explore turns spawn from a hub-managed cwd by default

Every Explore conversation turn (chat conversations with `kind='explore'`) SHALL spawn `claude` with `cwd = ~/.specrails/projects/<slug>/explore-cwd/` UNLESS the per-project `explore_mcp_enabled` setting is `true`. The hub-managed cwd MUST contain a hub-owned `CLAUDE.md` and a symlink `./project` (junction on Windows) pointing at the project's absolute path. The user's `<project>/CLAUDE.md` MUST NOT be modified, moved, deleted, or referenced by the spawn cwd in any way.

#### Scenario: Default Explore turn uses the hub-managed cwd

- **WHEN** an Explore conversation sends its first turn and `explore_mcp_enabled` is unset or `false`
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `CLAUDE.md` file
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: Toggle ON falls back to legacy spawn cwd

- **WHEN** an Explore turn is sent and `explore_mcp_enabled` is `true`
- **THEN** `claude` is spawned with `cwd` equal to `<project.path>`
- **AND** the hub-managed `explore-cwd/` directory is not used for that turn

#### Scenario: Project CLAUDE.md is never touched

- **WHEN** an Explore conversation is created, run, resumed, minimized, restored, or closed
- **THEN** the file `<project.path>/CLAUDE.md` is not modified, moved, or deleted by the hub
- **AND** the hub-managed `explore-cwd/CLAUDE.md` is a separate file with hub-owned content

### Requirement: Explore-cwd lifecycle is hub-managed

The hub SHALL ensure the per-project `explore-cwd/` directory exists, contains an up-to-date hub-owned `CLAUDE.md`, and exposes a `./project` link to the project path before any Explore turn spawns from it. The directory MUST be created lazily on first use rather than eagerly at server start. When a project is removed via `ProjectRegistry.removeProject`, the directory MUST be removed recursively (the `./project` link MUST be unlinked, not followed). When the hub version changes, the embedded `CLAUDE.md` content MUST be re-materialised on next use so the on-disk file matches the embedded template. The symlink MUST be recreated when the project's path has changed since last use.

#### Scenario: First Explore turn materialises the cwd

- **WHEN** a project sends its first ever Explore turn
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` is created
- **AND** `CLAUDE.md` is written from the embedded template
- **AND** `project` link is created pointing at `<project.path>`

#### Scenario: Project removal cleans up

- **WHEN** the project is removed from the hub registry
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` no longer exists
- **AND** any active Explore spawn for that project is terminated

#### Scenario: Hub version bump refreshes the template

- **WHEN** the hub starts after an upgrade and the next Explore turn fires
- **THEN** `explore-cwd/CLAUDE.md` is rewritten from the new embedded template
- **AND** the rewrite happens before the spawn

#### Scenario: Project path change triggers symlink recreation

- **WHEN** the registered project path differs from the symlink target on the next Explore turn
- **THEN** the existing `project` link is replaced with a fresh link to the current path
- **AND** the spawn proceeds with the corrected link in place

### Requirement: Explore system prompt is byte-stable across turns

The system prompt sent to `claude` for an Explore turn (i.e. when `options.lightweight === true`) MUST be byte-identical across two consecutive invocations of the same Explore conversation when neither the project name nor the attachment set has changed. The lightweight prompt builder MUST NOT inject timestamps, dynamic counts, job ids, recent-job summaries, cost figures, or any per-invocation data.

#### Scenario: Two consecutive lightweight prompt builds are byte-equal

- **WHEN** the lightweight system prompt is built twice in a row for the same project name with no attachments
- **THEN** the two strings are byte-for-byte equal

#### Scenario: Attachment-bearing turn appends a stable suffix

- **WHEN** the same prompt is built once with no attachments and once with attachments
- **THEN** the two strings differ only by appending the `USER_ATTACHMENT_SYSTEM_NOTE` suffix
- **AND** all other characters are unchanged

### Requirement: Per-project Use-MCPs-in-Explore toggle defaults OFF

The hub SHALL persist a per-project boolean setting `explore_mcp_enabled`, default `false`, exposed via `GET /api/projects/:projectId/explore-mcp-enabled` and `PATCH /api/projects/:projectId/explore-mcp-enabled`. The PATCH endpoint MUST accept `{ enabled: boolean }` and reject other payloads with HTTP 400. The setting MUST be read fresh at every Explore turn so toggling takes effect on the next message without restarting any process. The client SHALL render the toggle in `SettingsPage` under an Explore section.

#### Scenario: Default value is false

- **WHEN** a fresh project is registered and `GET /api/projects/:id/explore-mcp-enabled` is called before any user interaction
- **THEN** the response is `{ enabled: false }`

#### Scenario: Toggle takes effect on next turn

- **GIVEN** an active Explore conversation that has streamed at least one turn with `enabled=false`
- **WHEN** the user PATCHes `enabled=true` and sends another message in the same conversation
- **THEN** the next spawn uses `<project.path>` as cwd
- **AND** no process restart is required for the change to apply

#### Scenario: Invalid payload rejected

- **WHEN** the client PATCHes `{ enabled: "yes" }` or any non-boolean
- **THEN** the server responds 400
- **AND** the stored value is unchanged

### Requirement: Explore turns kept warm via session resume

Each Explore turn after the first SHALL be respawned with `--resume <session_id>` where `<session_id>` is the value captured from the conversation's first `system` event. The hub does not maintain a persistent claude child process across turns; instead, deterministic system prompt (per the byte-stability requirement) plus consistent `cwd` per turn keep the Anthropic prompt cache warm.

#### Scenario: Second turn uses --resume

- **GIVEN** an Explore conversation whose first turn captured `session_id=S`
- **WHEN** the user sends a second message
- **THEN** the spawned `claude` argv includes `--resume S`

#### Scenario: Resume is preserved across minimize and restore

- **GIVEN** an Explore conversation with `session_id=S` that was minimized and later restored
- **WHEN** the user sends the next message after restore
- **THEN** the spawned `claude` argv includes `--resume S`
- **AND** the conversation row's `session_id` value is unchanged

### Requirement: Idle-kill on minimize after 2 minutes

When an Explore conversation is minimized to the global toast dock, the hub SHALL start a 2-minute idle timer. If the conversation is not unminimised and does not receive a new user message before the timer fires, any active or pending `claude` child process for that conversation MUST be terminated (SIGTERM, 1 second grace, then SIGKILL). The conversation row, its `session_id`, and its draft state MUST NOT be deleted by this idle-kill — the next sent message respawns with `--resume`. If a turn is currently streaming when minimize occurs, the timer MUST NOT start until that turn completes.

#### Scenario: Idle 2 minutes after minimize kills the spawn

- **GIVEN** an Explore conversation with no in-flight turn that the user has just minimized
- **WHEN** 2 minutes elapse without unminimise or a new message
- **THEN** any associated child process is terminated
- **AND** the conversation row's `session_id` is preserved

#### Scenario: Streaming defers the timer

- **GIVEN** an Explore conversation streaming a turn
- **WHEN** the user minimizes mid-stream
- **THEN** the idle timer does not start while streaming continues
- **AND** the timer starts only after the streaming turn completes

#### Scenario: Activity before timer fires cancels it

- **GIVEN** an idle-kill timer is running at 90 seconds
- **WHEN** the user unminimises or sends a new message
- **THEN** the timer is cancelled
- **AND** no SIGTERM is delivered

#### Scenario: Restore after idle-kill respawns with resume

- **GIVEN** an Explore conversation whose process was idle-killed
- **WHEN** the user restores the chip and sends a new message
- **THEN** a fresh `claude` is spawned with `--resume <session_id>`
- **AND** the conversation history shown to the user is unchanged

### Requirement: Crash recovery auto-respawns once

If a `claude` child process for an in-flight Explore turn exits before emitting a `result` event, the hub SHALL respawn the same turn exactly once with the same prompt and `--resume <session_id>`. If the second attempt also exits without a `result` event, the hub MUST emit a `chat_error` for that conversation with a recognisable `crashed` reason. A successful turn SHALL reset the per-conversation crash counter to zero. The auto-respawn MUST NOT fire if the user has explicitly interrupted the turn (Stop button) before the crash occurs.

#### Scenario: First crash transparently respawns

- **GIVEN** an Explore turn whose child process exits non-zero before `result`
- **WHEN** no user interrupt was issued
- **THEN** a second `claude` spawn is started for the same turn with `--resume`
- **AND** the user sees streaming continue without an error message

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

### Requirement: Concurrency cap of five Explore spawns per project

The hub SHALL maintain at most five concurrent Explore `claude` child processes per project. When a sixth would be created, the hub MUST first kill the oldest currently-idle (not actively streaming) Explore process for the project. If all five are streaming, the new turn MUST be queued; if the queued turn has waited more than 30 seconds, the hub MUST emit a `chat_error` with reason `busy` and drop the queued spawn.

#### Scenario: Sixth spawn evicts the oldest idle process

- **GIVEN** five active Explore processes for a project, four streaming and one idle
- **WHEN** a sixth Explore turn is sent
- **THEN** the idle process is killed
- **AND** the new turn proceeds without queueing

#### Scenario: All-streaming queue and timeout

- **GIVEN** five Explore processes all currently streaming
- **WHEN** a sixth Explore turn is sent
- **THEN** the new turn is queued
- **AND** if no slot opens within 30 seconds the conversation receives a `chat_error` with reason `busy`

#### Scenario: Slot opens within timeout

- **GIVEN** a queued sixth turn at t=10 seconds
- **WHEN** any of the five streaming turns completes at t=15 seconds
- **THEN** the queued turn is dispatched immediately
- **AND** no `chat_error busy` is emitted

### Requirement: Explore overlay shows status pills until first text delta

The Explore overlay SHALL render a status pill area immediately when the user submits a turn, displaying a sequence of states derived from streamed events. The pills MUST disappear as soon as the first `text` delta of the assistant turn is received. Each individual pill MUST be visible for at least 150 milliseconds before being replaced, to avoid flicker. A skeleton bubble MUST be visible from the moment the user submits the message, before any WebSocket round-trip.

#### Scenario: Pill stages map to events

- **WHEN** the user submits an Explore turn
- **THEN** a pill labelled `Conectando…` appears within 16 ms of submission
- **AND** when the conversation receives a `system` event the pill changes to `Pensando…`
- **AND** when any `tool_use` event arrives during the same turn the pill changes to `Consultando código…`
- **AND** the pill area disappears as soon as the first `text` delta of the turn arrives

#### Scenario: Minimum 150 ms per pill prevents flicker

- **GIVEN** a turn whose `system` and first `text` events arrive within 50 ms of each other
- **WHEN** the pill `Pensando…` would normally show
- **THEN** the pill remains visible for at least 150 ms before being replaced or removed

#### Scenario: Skeleton appears at T+0

- **WHEN** the user clicks Send on the Explore composer
- **THEN** a skeleton assistant bubble is rendered before any server response
- **AND** the skeleton remains until either the first `text` delta or a terminal `chat_error` for that turn

### Requirement: Streaming text renders char-by-char on a smooth tick

The Explore overlay SHALL animate streamed assistant text into the DOM in a smooth char-by-char fashion driven by `requestAnimationFrame` or an equivalent ~60 fps tick, decoupled from the raw WebSocket batch cadence. Buffered characters MUST never be dropped: every character received in `chat_stream` deltas eventually appears in the rendered bubble. If the buffer grows beyond a configurable safety threshold (e.g. 4 KB), the renderer MAY flush the remaining buffer instantly to avoid falling far behind.

#### Scenario: Bursty deltas render smoothly

- **WHEN** the server emits a 500-character delta in a single `chat_stream` event
- **THEN** the rendered bubble grows character-by-character at a perceptible smooth rate
- **AND** every character of the delta eventually appears in the bubble

#### Scenario: Slow trickle still smooth

- **WHEN** the server emits ten single-character deltas spaced 30 ms apart
- **THEN** the rendered bubble shows characters appearing at the cadence the model produced them, without frame drops

#### Scenario: Safety flush on extreme backlog

- **GIVEN** a 100 KB delta arriving in a single event
- **WHEN** the buffer exceeds the safety threshold
- **THEN** the renderer flushes the remaining buffer to the DOM in one go
- **AND** no characters are lost

### Requirement: Rollback escape hatches preserve correctness

The change SHALL provide two independently-toggleable escape hatches:

1. An environment variable `SPECRAILS_EXPLORE_LEGACY_CWD=1` MUST cause every Explore spawn to use `<project.path>` as `cwd`, regardless of the per-project toggle, and MUST cause `ExploreCwdManager` to skip materialising the explore-cwd directory entirely.
2. A client-side build-time flag `VITE_FEATURE_EXPLORE_PREMIUM_UX=false` MUST disable the status pills, the skeleton, and the char-by-char renderer, falling back to the pre-change rendering of `chat_stream` deltas.

Both escape hatches MUST keep the Explore feature functionally usable and MUST NOT cause any data loss in conversations or drafts.

#### Scenario: Server escape hatch forces legacy cwd

- **GIVEN** the server is started with `SPECRAILS_EXPLORE_LEGACY_CWD=1`
- **WHEN** any Explore turn is sent
- **THEN** the spawn `cwd` is `<project.path>`
- **AND** `~/.specrails/projects/<slug>/explore-cwd/` is not created or modified

#### Scenario: Client escape hatch disables premium UX

- **GIVEN** the client is built with `VITE_FEATURE_EXPLORE_PREMIUM_UX=false`
- **WHEN** the user submits an Explore turn
- **THEN** no status pills are rendered
- **AND** no skeleton bubble is rendered
- **AND** streamed deltas render directly without char-by-char animation
- **AND** the conversation history and draft state are unaffected
