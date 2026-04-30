## ADDED Requirements

### Requirement: Shell-integration shim composition at spawn time
At PTY spawn time, the `TerminalManager` SHALL consult `resolveTerminalSettings(projectId)` and, when `shellIntegrationEnabled` is `true`, compose shell-specific arguments and environment overrides that load the bundled shell-integration shim. The composition logic MUST be encapsulated in a single helper (`composeShellIntegrationSpawn`) returning `{ args: string[], env: Record<string,string>, shimPath: string | null }` so the spawn site remains shell-agnostic. When `shellIntegrationEnabled` is `false`, the helper MUST return `{ args: [], env: {}, shimPath: null }` and the spawn MUST proceed exactly as before.

#### Scenario: zsh spawn args unchanged when integration off
- **WHEN** `shellIntegrationEnabled = false` and the resolved shell is zsh
- **THEN** the spawn arguments are the existing `["-l", "-i"]` and `env.ZDOTDIR` is not set by the manager

#### Scenario: zsh spawn args extended when integration on
- **WHEN** `shellIntegrationEnabled = true` and the resolved shell is zsh
- **THEN** the spawn arguments are `["-l", "-i"]` (unchanged), and `env.ZDOTDIR` is set to a per-session writable directory containing a generated `.zshrc` that sources the user's `~/.zshrc` then loads the bundled shim

#### Scenario: Per-session shim path is unique and chmod 600
- **WHEN** two sessions are spawned for the same project with shell integration enabled
- **THEN** each receives a distinct `shimPath` under `~/.specrails/projects/<slug>/terminals/<sessionId>/`
- **AND** every generated shim file has mode `0600`

### Requirement: OSC 133 / OSC 1337 mark forwarding over the existing terminal WebSocket
The existing `/ws/terminal/:id` socket SHALL gain a new server-to-client JSON control message: `{ "type": "mark", "kind": "prompt-start" | "prompt-end" | "pre-exec" | "post-exec" | "cwd", payload?: object, ts: number }`. The bytes corresponding to those OSC sequences MUST also continue to flow as part of the binary stream so the renderer (and image addon) can observe them. The control frame MUST NOT be sent for malformed sequences. No new WebSocket endpoint and no protocol version bump are required.

#### Scenario: Prompt-start mark control frame
- **WHEN** the PTY emits `\x1b]133;A\x07` and shell integration is on
- **THEN** the server sends a JSON text frame `{"type":"mark","kind":"prompt-start","ts":<unixMs>}`
- **AND** the binary frame containing those bytes is also delivered to xterm

#### Scenario: Post-exec mark with exit code payload
- **WHEN** the PTY emits `\x1b]133;D;0\x07`
- **THEN** the server sends `{"type":"mark","kind":"post-exec","payload":{"exitCode":0},"ts":<unixMs>}`

#### Scenario: Mark frames absent when integration off
- **WHEN** `shellIntegrationEnabled = false` and the session never emits OSC 133 sequences
- **THEN** no mark frames are ever sent
- **AND** the binary stream is forwarded unchanged

### Requirement: Per-session shim cleanup
The `TerminalManager` SHALL delete the per-session shim directory when its PTY exits (clean kill or process exit). On server startup, the manager SHALL scan `~/.specrails/projects/*/terminals/` for shim directories whose owning session is no longer alive (no matching active session in the registry on cold start, since the registry is volatile) and remove any directory older than 24 hours.

#### Scenario: Shim cleanup on session kill
- **WHEN** a session with shell integration is killed
- **THEN** the directory `~/.specrails/projects/<slug>/terminals/<sessionId>/` and all contents are removed before the kill response returns

#### Scenario: Stale shim cleanup on startup
- **WHEN** the server starts and finds a 48-hour-old shim directory under `~/.specrails/projects/foo/terminals/<orphan>/`
- **THEN** that directory is removed during the first 5 seconds of server start
- **AND** directories younger than 24 hours are left alone

## MODIFIED Requirements

### Requirement: Resize propagation
Clients SHALL send resize control messages `{"type":"resize","cols":N,"rows":M}` when the xterm container resizes. The client-side resize emission MUST be debounced (trailing) so a sustained transition or drag produces a single final resize after the geometry stabilises. The server MUST call `pty.resize(cols, rows)` and update the session's stored dimensions. If multiple clients are attached with different viewport sizes, the server MUST honor the most recent resize.

#### Scenario: Resize reaches child process
- **WHEN** client sends `{"type":"resize","cols":100,"rows":30}`
- **THEN** the PTY is resized and `stty size` in the shell outputs `30 100`

#### Scenario: Resize coalesced during sidebar transition
- **WHEN** an ancestor sidebar transitions over 200ms and the ResizeObserver ticks 12 times during that window
- **THEN** the client sends at most one `resize` message — emitted after the trailing 120ms debounce or upon the ancestor's `transitionend`, whichever fires first
- **AND** if both occur, only the first emission is sent and the second is suppressed for the same final dimensions

#### Scenario: Resize from drag handle still snappy
- **WHEN** the user manually drags the panel height producing 50 resize events in 200ms
- **THEN** at least one resize message is sent during the drag, and exactly one final resize is sent within 120ms after drag end
