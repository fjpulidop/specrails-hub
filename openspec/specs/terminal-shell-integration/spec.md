# terminal-shell-integration Specification

## Purpose
Inject per-session shell-integration shims into spawned PTYs (zsh, bash, fish, PowerShell), parse OSC 133 / OSC 1337 sequences server-side into structured command marks, persist completed commands per project, and surface prompt navigation, command timing, and long-running command notifications in the client.

## Requirements

### Requirement: Auto-injected shell-integration shim per spawned PTY
The server SHALL inject a per-session shell-integration shim into every PTY spawned via `terminal-manager.ts` whenever `terminal_settings.shellIntegrationEnabled` resolves to `true` for that project. The shim MUST be injected without modifying the user's home-directory rc files. The shim MUST chain to the user's normal startup files so that the user's environment, prompt, aliases, and tooling continue to load. Supported shells: zsh, bash, fish, PowerShell.

#### Scenario: zsh spawn uses ZDOTDIR override
- **WHEN** the resolved shell is `/bin/zsh` (or any path whose basename is `zsh`) and shell integration is enabled
- **THEN** the server writes a temp `.zshrc` shim under `~/.specrails/projects/<slug>/terminals/<sessionId>/` with `chmod 600`
- **AND** the PTY is spawned with `env.ZDOTDIR` pointing at that directory
- **AND** the shim's first non-comment line sources the user's real `~/.zshrc` if it exists
- **AND** the shim registers `precmd` and `preexec` hooks that emit `\x1b]133;A\x07`, `\x1b]133;B\x07`, `\x1b]133;C\x07`, and `\x1b]133;D;<exit>\x07`

#### Scenario: bash spawn uses --rcfile
- **WHEN** the resolved shell basename is `bash`
- **THEN** the PTY is spawned with `--rcfile <shimPath>` appended to its arguments before `-i`
- **AND** the shim sources `~/.bashrc` first, then appends `PROMPT_COMMAND` and a `DEBUG` trap that emit OSC 133 sequences

#### Scenario: fish spawn uses XDG_CONFIG_HOME override
- **WHEN** the resolved shell basename is `fish`
- **THEN** the server writes `<shimDir>/fish/conf.d/specrails-shim.fish` and spawns fish with `env.XDG_CONFIG_HOME = <shimDir>`
- **AND** the conf.d entry runs after the user's own `config.fish` and registers `fish_preexec` / `fish_postexec` handlers emitting OSC 133

#### Scenario: PowerShell spawn dot-sources existing $PROFILE
- **WHEN** the resolved shell basename is `powershell.exe`, `pwsh`, or `pwsh.exe`
- **THEN** the PTY is spawned with `-NoLogo -NoExit -File <shim.ps1>`
- **AND** the shim dot-sources the original `$PROFILE` if it exists, then registers a `PromptFunction` wrapper emitting OSC 133 sequences before each prompt

#### Scenario: Shell-integration disabled per project skips injection
- **WHEN** `terminal_settings.shellIntegrationEnabled` resolves to `false`
- **THEN** the PTY is spawned without the shim (no `--rcfile`, no `ZDOTDIR`, no `XDG_CONFIG_HOME` override)
- **AND** no temp shim file is created on disk

#### Scenario: Sentinel-not-seen toast surfaces
- **WHEN** shell integration was enabled at spawn time and no OSC 133 prompt-mark is observed within 5 seconds of the first PTY data flush
- **THEN** the panel surfaces a one-time toast: "Shell integration unavailable for this shell — features that depend on prompt marks are disabled."
- **AND** the toast offers a link to the terminal settings section
- **AND** the same toast is not re-shown for the same session

### Requirement: Server-side OSC parsing into structured command marks
The server SHALL parse `\x1b]133;A\x07`, `\x1b]133;B\x07`, `\x1b]133;C\x07`, `\x1b]133;D[;<exitCode>]\x07`, and `\x1b]1337;CurrentDir=<path>\x07` sequences out of every PTY chunk and emit a JSON control frame on the existing `/ws/terminal/:id` socket. The parser MUST NOT remove the bytes from the binary stream forwarded to xterm — `\x1b]1337;File=…` (inline image) sequences must reach the client renderer intact. The parser MUST be tolerant of malformed sequences and MUST NOT block the byte stream.

#### Scenario: Prompt-start mark broadcast
- **WHEN** the PTY emits `\x1b]133;A\x07`
- **THEN** the server sends `{ type: "mark", kind: "prompt-start", sessionId, ts }` as a JSON text frame on the terminal WS
- **AND** the same bytes also arrive in the binary stream forwarded to xterm

#### Scenario: Post-exec mark carries exit code
- **WHEN** the PTY emits `\x1b]133;D;7\x07`
- **THEN** the server sends `{ type: "mark", kind: "post-exec", exitCode: 7, sessionId, ts }`

#### Scenario: CurrentDir mark broadcast
- **WHEN** the PTY emits `\x1b]1337;CurrentDir=/Users/me/repo\x07`
- **THEN** the server sends `{ type: "mark", kind: "cwd", path: "/Users/me/repo", sessionId, ts }`

#### Scenario: Malformed sequence does not break parsing
- **WHEN** the PTY emits a truncated sequence such as `\x1b]133;A` (no terminator) followed by valid prompt output
- **THEN** the parser emits no JSON control frame for the malformed sequence
- **AND** subsequent valid sequences are parsed correctly
- **AND** the binary stream forwarded to xterm is byte-identical to the input

### Requirement: Per-project command-mark persistence
For every PTY session, completed commands (defined as a `pre-exec` followed by a matching `post-exec`) SHALL be written into the per-project `terminal_command_marks` table with `{ sessionId, startedAt, finishedAt, exitCode, command, cwd }`. The table SHALL retain at most 1000 rows per `sessionId`, evicting the oldest rows FIFO when the cap is reached.

#### Scenario: Completed command persisted
- **WHEN** the parser observes `pre-exec` then `post-exec(exitCode=0)` for a session within the same connection
- **THEN** a row is inserted with the elapsed millisecond delta between marks and the captured command text (best-effort from `pre-exec` payload)

#### Scenario: Cap eviction is FIFO per session
- **WHEN** session S already has 1000 rows and a new completed command arrives
- **THEN** the oldest row for session S is deleted
- **AND** rows belonging to other sessions are not affected

#### Scenario: Dangling pre-exec on session kill is recorded as killed
- **WHEN** a session is killed while a `pre-exec` is open without a matching `post-exec`
- **THEN** a row is written with `exitCode = NULL` and `finishedAt = killedAt`

### Requirement: Prompt navigation and command-timing UI
The client SHALL render a left-margin gutter inside the terminal viewport that draws a marker for every prompt-start mark observed in the visible scrollback. The gutter marker MUST be coloured by exit code (success neutral, non-zero error). The user SHALL be able to jump to the previous or next prompt mark via `Cmd+↑` / `Cmd+↓`. A timing badge SHALL render inline next to the prompt for any command whose elapsed time from `pre-exec` to `post-exec` exceeds 500ms.

#### Scenario: Cmd+ArrowUp scrolls to previous prompt
- **WHEN** the user presses `Cmd+ArrowUp` while the terminal is focused
- **THEN** the xterm scrolls so the previous prompt-start mark is at the top of the viewport
- **AND** if no earlier mark exists, the scroll position does not change

#### Scenario: Exit-code colouring
- **WHEN** a command finishes with non-zero exit code
- **THEN** the gutter marker for its prompt is rendered with the error colour from the active theme
- **AND** the timing badge text colour matches

#### Scenario: Long-running command badge updates live
- **WHEN** a `pre-exec` mark has been open for more than 500ms with no `post-exec`
- **THEN** the badge appears next to the prompt and updates its elapsed-time text at 1Hz until the `post-exec` arrives

### Requirement: Long-running command notification
The client SHALL fire a desktop notification when a foreground command completes whose elapsed time from `pre-exec` to `post-exec` exceeds the configured `longCommandThresholdMs` (default 60000), AND the application window is unfocused at the moment of completion. Notifications MUST be debounced per `(sessionId, command)` tuple over a 5-second window so a watch-mode test runner does not produce a notification storm.

#### Scenario: Notification fires when window unfocused
- **WHEN** a command finishes after 1m 42s, the app window is not focused, threshold is 60s, and notifications are enabled
- **THEN** a desktop notification is posted with title "`<command>` finished" and body "exit `<code>` in `<elapsed>`"

#### Scenario: No notification when window focused
- **WHEN** the same command finishes while the app window is focused
- **THEN** no notification is fired
- **AND** the timing badge in the gutter still updates

#### Scenario: Debounce dedupe within 5s
- **WHEN** the same `(sessionId, command)` tuple completes twice within 5 seconds
- **THEN** only the first completion produces a notification
- **AND** the second is silently dropped

#### Scenario: Notifications disabled in settings
- **WHEN** `terminal_settings.notifyOnCompletion` resolves to `false`
- **THEN** no notification is fired regardless of threshold or focus state
