## ADDED Requirements

### Requirement: Search overlay above terminal viewport
The panel SHALL render a closable search overlay above the active terminal viewport when invoked via `Cmd+F` (macOS) / `Ctrl+F` (others) while the terminal is focused. The overlay MUST surface controls for next, previous, case-sensitivity, regex, and whole-word toggles, plus a match-count badge. The overlay MUST stack above the terminal without resizing the PTY.

#### Scenario: Overlay renders without triggering PTY resize
- **WHEN** the user presses `Cmd+F` while a terminal session is active
- **THEN** the overlay appears anchored top-right of the viewport
- **AND** the underlying terminal cols/rows are unchanged
- **AND** no `resize` control frame is sent

#### Scenario: Match count badge updates as user types
- **WHEN** the user types into the overlay's search input
- **THEN** a "X of Y" badge updates with the count of matches in the visible scrollback buffer

### Requirement: Right-click context menu in viewport
The panel SHALL display a context menu when the user right-clicks inside the active terminal viewport. The menu items MUST be: Copy, Paste, Select All, Clear, Search, Save scrollback to file, and "Open this directory" (only when shell integration has reported a CWD for the session). The menu MUST close on outside-click and on Escape and MUST NOT cover the StatusBar.

#### Scenario: Menu position clamped to viewport bounds
- **WHEN** the user right-clicks near the bottom-right corner of the viewport
- **THEN** the menu appears flipped (anchored above-and-left of the click point) so it does not overflow the panel bounds

#### Scenario: Open this directory hidden when no CWD known
- **WHEN** the active session has no CWD mark recorded
- **THEN** the "Open this directory" item is omitted from the menu

### Requirement: Prompt navigation gutter
When the active session has any prompt mark recorded for its scrollback, the panel SHALL render a 4-pixel-wide left-margin gutter inside the terminal viewport drawing one marker per prompt mark visible in the buffer. Each marker MUST be coloured by the exit code of its corresponding command (neutral for success, error theme colour for non-zero exit). The gutter MUST be a passive overlay (no input absorption) and MUST scroll with the buffer.

#### Scenario: Gutter draws one mark per prompt
- **WHEN** the buffer contains 5 commands all completed
- **THEN** 5 gutter markers are drawn at the corresponding row positions, scrolling in sync with the terminal

#### Scenario: Gutter hidden when no marks
- **WHEN** the active session has zero prompt marks recorded (shell integration disabled or shim never bootstrapped)
- **THEN** the gutter is not rendered and the viewport occupies its full width

### Requirement: Drag-drop visual highlight
When a file is being dragged over the active terminal viewport, the panel SHALL render a soft visual highlight (outline + low-opacity overlay) around the viewport bounds. The highlight MUST appear regardless of whether the runtime is Tauri or browser. In a non-Tauri runtime, releasing the drag MUST dismiss the highlight without inserting any text.

#### Scenario: Highlight on dragover
- **WHEN** an external file is dragged over the active viewport
- **THEN** the viewport border is rendered with the configured accent colour and a subtle internal overlay
- **AND** the highlight is removed on `dragleave` or `drop`

### Requirement: Per-session font-size hot-reload
Toggling the active session's font size via `Cmd+=` / `Cmd+-` / `Cmd+0` SHALL immediately re-render the live xterm at the new size and persist the change to the per-project settings override. Inactive sessions for the same project MUST also re-render on the next adoption into the viewport (so `<TerminalViewport>` mounts at the new size).

#### Scenario: Cmd+= rerenders without scrollback loss
- **WHEN** a session has visible output and the user presses `Cmd+=`
- **THEN** the rendered grid uses the new font size on the very next animation frame
- **AND** no PTY `resize` is sent until the trailing-debounced ResizeObserver fires
- **AND** scrollback content is preserved

### Requirement: Resize-debounce settles in one final frame
The viewport SHALL coalesce ResizeObserver-driven `fit.fit()` invocations through a trailing 120ms debounce. When an ancestor sidebar's CSS transition ends, the viewport SHALL refit synchronously. The cumulative effect MUST be at most one PTY `resize` message per stable geometry transition.

#### Scenario: Sidebar collapse produces single resize
- **WHEN** the user collapses a sidebar that animates over 200ms
- **THEN** during the animation the panel content does not visibly jitter
- **AND** exactly one `resize` control frame is sent on the terminal WS once the animation settles

## MODIFIED Requirements

### Requirement: Persistent xterm DOM per terminal
Each terminal's xterm.js instance SHALL remain mounted in the DOM from creation until explicit kill. Switching projects, switching active terminal, or toggling panel visibility MUST NOT unmount the xterm container or call its `dispose()` method. Inactive terminals MUST be hidden via CSS `display: none` only. Render-mode changes (canvas ↔ WebGL) and shell-integration toggle changes MUST NOT cause the xterm instance to dispose; instead, the policy described in `terminal-settings` (next-spawn application) applies.

#### Scenario: No reinit on project switch
- **WHEN** the user has terminal T1 running in project A with output history, switches to project B, then back to A
- **THEN** T1's xterm shows the same scrollback and cursor position as before the switch
- **AND** no new `Terminal()` constructor call occurred for T1

#### Scenario: No glitch on active switch
- **WHEN** the user switches from terminal T1 to T2 within the same project and back
- **THEN** T1's rendered content is identical, including cursor blink position

#### Scenario: Render mode change does not dispose live session
- **WHEN** the user toggles `renderMode` from `auto` to `canvas` while session T1 is alive
- **THEN** T1's `Terminal` instance is not disposed and continues operating in its boot-time renderer
- **AND** the next newly-created session uses canvas
