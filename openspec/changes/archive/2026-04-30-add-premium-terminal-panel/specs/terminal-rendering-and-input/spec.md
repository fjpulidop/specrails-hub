## ADDED Requirements

### Requirement: WebGL renderer with canvas fallback
The terminal SHALL load the `@xterm/addon-webgl` renderer when the resolved `terminal_settings.renderMode` is `"webgl"`, or when it is `"auto"` and `WebGL2RenderingContext` is available in the browser/WebView. On WebGL initialisation failure or `webglcontextlost` event, the renderer MUST fall back to xterm's canvas renderer and surface a one-time toast informing the user. When `renderMode` is `"canvas"`, the WebGL addon MUST NOT be loaded.

#### Scenario: Auto resolves to WebGL when available
- **WHEN** `renderMode = "auto"` and the WebView exposes WebGL2
- **THEN** `WebglAddon` is loaded after `term.open` and the canvas fallback is not active

#### Scenario: Auto resolves to canvas when WebGL2 missing
- **WHEN** `renderMode = "auto"` and `WebGL2RenderingContext` is undefined
- **THEN** the canvas renderer is used and no WebGL addon is loaded

#### Scenario: WebGL context loss triggers fallback
- **WHEN** the WebGL renderer fires `webglcontextlost`
- **THEN** the addon is disposed, the canvas renderer becomes active, and a toast "Terminal switched to canvas renderer (WebGL context lost)" is shown once
- **AND** scrollback content is preserved through the fallback

#### Scenario: Forced canvas mode never loads WebGL
- **WHEN** `renderMode = "canvas"`
- **THEN** `WebglAddon` is not constructed and not loaded for any session

### Requirement: Unicode 11 width tables
The terminal SHALL load `@xterm/addon-unicode11` and call `term.unicode.activeVersion = "11"` after `term.open` for every session. This MUST apply regardless of render mode.

#### Scenario: Emoji renders at correct width
- **WHEN** the PTY emits a single emoji code point
- **THEN** the rendered glyph occupies exactly two terminal cells without misaligning the line

### Requirement: Programming ligatures rendering
The terminal SHALL load `@xterm/addon-ligatures` and enable ligature rendering for the configured font. If the configured font lacks ligature OpenType features, the addon MUST be a silent no-op (no thrown errors, no visual artefacts).

#### Scenario: Ligature font joins arrow
- **WHEN** the font is `"FiraCode"` and the buffer contains `=>`
- **THEN** the rendered glyphs visually join into the ligature
- **AND** the underlying buffer characters are unchanged for copy operations

#### Scenario: Non-ligature font is no-op
- **WHEN** the font is `"Menlo"` (no ligature features)
- **THEN** characters render unchanged and no error is logged

### Requirement: Scrollback search overlay
The panel SHALL provide a scrollback search overlay opened via `Cmd+F` (macOS) / `Ctrl+F` (other) when the terminal is focused. The overlay MUST support next-match, previous-match, case-sensitive toggle, regex toggle, and whole-word toggle. The overlay MUST be closeable via `Escape`. Search MUST highlight matches inline using `@xterm/addon-search` decorations.

#### Scenario: Cmd+F opens overlay and focuses input
- **WHEN** the user presses `Cmd+F` while the terminal is focused
- **THEN** the overlay appears anchored to the top-right of the viewport with the text input focused

#### Scenario: Enter advances to next match
- **WHEN** the user types `error` and presses Enter
- **THEN** the first match scrolls into view and is highlighted
- **AND** subsequent Enter presses advance to the next match

#### Scenario: Escape closes overlay and clears decorations
- **WHEN** the overlay is open and the user presses Escape
- **THEN** the overlay hides, the decorations are cleared, and focus returns to the xterm

### Requirement: Custom keybindings for clipboard and clear
The terminal SHALL register an `attachCustomKeyEventHandler` that intercepts the following keystrokes (using `Cmd` on macOS, `Ctrl` elsewhere): `Cmd+C` copies the current selection to the OS clipboard via `navigator.clipboard.writeText` and prevents the default; `Cmd+V` pastes from `navigator.clipboard.readText` via `term.paste(text)` (so bracketed-paste mode is honoured); `Cmd+K` calls `term.clear()`; `Cmd+F` opens the search overlay; `Cmd+=` and `Cmd+-` adjust the active session font size by 1px (clamped 8-32); `Cmd+0` resets to the resolved default. All other keystrokes MUST pass through to xterm.

#### Scenario: Cmd+C copies non-empty selection
- **WHEN** the terminal has selected text "hello world" and the user presses `Cmd+C`
- **THEN** `navigator.clipboard.writeText` is called with `"hello world"`
- **AND** xterm's default paste/copy is not triggered

#### Scenario: Cmd+C with empty selection passes through
- **WHEN** there is no current selection and the user presses `Cmd+C`
- **THEN** the handler returns true (let xterm handle) so the keystroke reaches the PTY (allowing apps like vim to receive `Ctrl+C` semantics)

#### Scenario: Cmd+V pastes via term.paste
- **WHEN** the user presses `Cmd+V` with `"foo\nbar"` on the clipboard
- **THEN** `term.paste("foo\nbar")` is called and the PTY receives the bracketed-paste-wrapped sequence

#### Scenario: Cmd+K clears and preserves cursor
- **WHEN** the user presses `Cmd+K`
- **THEN** `term.clear()` is called and the cursor remains at column/row consistent with xterm's clear semantics

#### Scenario: Cmd+= zooms in by 1px
- **WHEN** the current font size is 12 and the user presses `Cmd+=`
- **THEN** the active session's font size becomes 13 and the change is persisted to the user's effective settings (per-project override layer)

#### Scenario: Font zoom clamped to 8-32
- **WHEN** the current font size is 32 and the user presses `Cmd+=`
- **THEN** the size remains 32 and no persistence write occurs

### Requirement: Right-click context menu
The terminal viewport SHALL display a context menu on right-click (or `Ctrl+click` on macOS where applicable) with the following actions: Copy (enabled when there is a selection), Paste, Select All, Clear, Search, Save scrollback to file, and (when the active session has any prompt mark with a CWD payload) "Open this directory in Finder/Explorer". The menu MUST close on outside click or Escape.

#### Scenario: Right-click opens at cursor
- **WHEN** the user right-clicks anywhere inside the active terminal viewport
- **THEN** the menu appears at the click coordinates

#### Scenario: Copy disabled when no selection
- **WHEN** the menu opens with no current selection
- **THEN** Copy is shown but disabled (greyed out, not actionable)

#### Scenario: Open this directory routes through Tauri shell
- **WHEN** the active session's most recent CWD mark is `/Users/me/repo` and the user clicks "Open this directory"
- **THEN** the Tauri `revealItemInDir` API is invoked with that path
- **AND** in non-Tauri context this menu item is hidden

#### Scenario: Save scrollback writes file
- **WHEN** the user clicks "Save scrollback to file"
- **THEN** the panel collects `term.buffer.active.length` rows of plain text via `term.buffer.active.getLine(i).translateToString(true)` and triggers a download (browser) or Tauri `dialog.save` + `fs.writeTextFile` (desktop)

### Requirement: Drag-and-drop external file path injection (Tauri)
When running inside the Tauri webview, dropping one or more files from the operating system onto the active terminal viewport SHALL insert each file's absolute path into the active terminal as if pasted. Multiple paths MUST be space-separated. Each path MUST be shell-quoted for the host platform (POSIX single-quote escaping on macOS/Linux, double-quote with `^`-escaping on Windows). Inside the active viewport bounds, the dragover MUST display a visible drop highlight. In a non-Tauri context (plain browser), the listeners MUST be a silent no-op (no error, no path read attempted).

#### Scenario: Single file path injected with quoting
- **WHEN** the user drops `/Users/me/My File.txt` into the active terminal viewport in Tauri
- **THEN** `term.paste("'/Users/me/My File.txt'")` is called with POSIX single-quote escaping
- **AND** the active session is the one targeted by the drop coordinates

#### Scenario: Multiple files joined with spaces
- **WHEN** the user drops two files at once
- **THEN** both are quoted independently and joined by a single space, then pasted

#### Scenario: Browser context is silent no-op
- **WHEN** running in a plain web browser and a file is dragged-dropped onto the viewport
- **THEN** no error is logged, no toast is shown, and no path is inserted

#### Scenario: Drop outside active viewport rejected
- **WHEN** the drop coordinates fall on the sidebar or top-bar (not the active viewport)
- **THEN** the drop is ignored and no paste occurs

### Requirement: Resize debouncing during sidebar transitions
The viewport SHALL debounce its `ResizeObserver`-driven `fit.fit()` calls with a trailing 120ms window. The viewport SHALL additionally listen for `transitionend` events bubbling from ancestor elements bearing the `data-sidebar` attribute (or the standard `<aside>` element); on such an event whose `propertyName` is `width` or `height`, the viewport MUST issue an immediate refit so the geometry settles in one final frame.

#### Scenario: Multiple ResizeObserver ticks coalesce to one fit
- **WHEN** the sidebar animates over 200ms producing 12 ResizeObserver ticks
- **THEN** `fit.fit()` is invoked exactly once during the animation, after the final tick + 120ms

#### Scenario: transitionend triggers immediate refit
- **WHEN** an ancestor `<aside>` finishes its width transition (`transitionend` with `propertyName === "width"`)
- **THEN** `fit.fit()` is called synchronously on that event
- **AND** a `resize` control frame is sent on the PTY WS with the new cols/rows

#### Scenario: Single resize is not unduly delayed
- **WHEN** a one-shot programmatic resize of the panel happens (no ongoing transition)
- **THEN** the trailing debounce fires within 120ms of the single ResizeObserver tick

### Requirement: Shift-drag mouse-mode-bypass hint
When the active terminal is running an application that has enabled mouse reporting (`DECSET 1000` / `1006`), the panel SHALL surface a one-time tooltip on the user's first selection drag attempt indicating that `Shift+drag` performs a native xterm selection. The tooltip MUST NOT be shown again for that session and SHOULD persist a `dismissedAt` flag in `localStorage` so it is not re-shown for that user.

#### Scenario: First drag in mouse-mode shows tooltip
- **WHEN** the active session has mouse mode enabled and the user begins a drag inside the viewport for the first time in this user profile
- **THEN** a small tooltip "Hold ⇧ to select text" appears near the drag origin and fades after 3 seconds
- **AND** subsequent drags do not show the tooltip
