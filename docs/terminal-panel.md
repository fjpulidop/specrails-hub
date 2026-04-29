# Terminal panel

The bottom-of-window terminal panel (toggle with `Cmd+J` / `Ctrl+J`) is a full-fat xterm.js terminal layered with premium features. This document is a quick reference; for design rationale see `openspec/changes/add-premium-terminal-panel/`.

## Keybindings

| Action | macOS | Other |
|---|---|---|
| Toggle panel | `Cmd+J` | `Ctrl+J` |
| Copy selection | `Cmd+C` | `Ctrl+C` |
| Paste (bracketed) | `Cmd+V` | `Ctrl+V` |
| Clear scrollback | `Cmd+K` | `Ctrl+K` |
| Find in scrollback | `Cmd+F` | `Ctrl+F` |
| Zoom font | `Cmd+=` / `Cmd+-` | `Ctrl+=` / `Ctrl+-` |
| Reset font size | `Cmd+0` | `Ctrl+0` |
| Jump to previous prompt | `Cmd+ArrowUp` | `Ctrl+ArrowUp` |
| Jump to next prompt | `Cmd+ArrowDown` | `Ctrl+ArrowDown` |

`Cmd+C` only consumes the keystroke when there is a non-empty selection; otherwise it passes through to the PTY (so apps like vim still receive `Ctrl+C`). Inside an alt-screen app that has enabled mouse reporting (tmux, htop), hold `Shift` while dragging to bypass mouse-mode and use native xterm selection.

## Drag and drop

Inside the desktop app (Tauri), drop one or more files from Finder/Explorer onto the terminal viewport to paste their absolute paths into the active session. Paths are shell-quoted for the host platform (POSIX single-quote on macOS/Linux, Windows-cmd double-quote with `^`-escaped percent/caret on Windows). In a plain browser context this is a silent no-op (the browser does not expose `File.path`).

## Shell integration

Shell integration is **on by default** (toggle in Settings → Terminal panel). The panel auto-injects a small shim that emits OSC 133 prompt marks plus OSC 1337 `CurrentDir=…`. The shim is loaded *only* in the panel's spawned shell — your normal terminal apps elsewhere are untouched.

Per shell:

| Shell | Mechanism |
|---|---|
| zsh | `ZDOTDIR=<shim dir>` env override; the shim's `.zshrc` sources `~/.zshrc` first |
| bash | `--rcfile <shim path>`; the shim sources `~/.bashrc` first |
| fish | `XDG_CONFIG_HOME=<shim dir>`; `conf.d/specrails-shim.fish` runs after `config.fish` |
| PowerShell | `-NoLogo -NoExit -File <shim.ps1>`; the shim dot-sources the original `$PROFILE` |

Each shim sets `SPECRAILS_SHELL_INTEGRATION_LOADED=1` as a sentinel. If no `prompt-start` mark arrives within ~5 seconds of the first prompt, the panel surfaces a toast: "Shell integration unavailable for this shell — prompt marks are disabled." This typically means the user's `~/.zshrc` runs `exec zsh` (which throws away our `ZDOTDIR`) or a similarly aggressive customisation. In that case, disable shell integration in Settings; the rest of the panel keeps working.

## What you get from shell integration

- **Prompt navigation**: `Cmd+↑` / `Cmd+↓` jump between prompt marks in scrollback.
- **Per-command timing**: a small badge surfaces in-progress wall-clock time once a command runs >500ms; hides on completion.
- **Long-running command notifications**: when a command exceeds the configured threshold (default 60s) and the window is unfocused, a desktop notification fires. Tauri uses the native plugin; browsers fall back to HTML5 `Notification`.
- **"Open this directory"** in the right-click menu when a CWD has been observed.

## Right-click menu

Right-click anywhere in the active terminal viewport: Copy / Paste / Select All / Clear / Search… / Save scrollback to file…, plus "Open `<cwd>`" when shell integration has reported a CWD. The menu position flips when near the bottom-right corner of the viewport.

## Settings

Hub-wide defaults live in Global Settings → Terminal panel. Per-project overrides live in Project Settings → Terminal panel. Resolution: project override wins per-field; absent fields fall back to hub.

Hot-reload semantics:

- Font family / size / copy-on-select / threshold / notify-on-completion **apply live** to existing sessions on save.
- Render mode (auto/canvas/webgl), shell integration, image rendering apply on the **next spawned** session; live sessions retain their boot-time configuration.

Render mode `auto` picks WebGL when the WebView exposes WebGL2; on `webglcontextlost` the panel falls back to canvas with a one-time toast.

## Inline images

The panel decodes Sixel and iTerm2 inline-image protocols via `@xterm/addon-image`. Try `imgcat foo.png` or any tool that emits Sixel. Disable in Settings if you hit memory pressure on heavy image streams (per-frame cap is 8 megapixels, in-flight cache cap is 32 MB).

## Diagnostics

If something looks broken:

1. Open Settings → Terminal panel and confirm shell integration is enabled.
2. Check that `printenv SPECRAILS_SHELL_INTEGRATION_LOADED` outputs `1` inside a freshly opened terminal.
3. Open a session, then `printf '\x1b]133;A\x07'` manually and watch the gutter — a marker should appear.
4. As a last resort, disable shell integration (Settings) and re-enable; new sessions will receive a fresh shim.

For deeper inspection of how the panel resolves PATH at startup (relevant for shells that require Volta/nvm/asdf shims), use `GET /api/hub/setup-prerequisites?diagnostic=1` from the hub.
