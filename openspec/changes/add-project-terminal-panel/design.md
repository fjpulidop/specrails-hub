## Context

specrails-hub currently spawns Claude CLI processes (`QueueManager`, `ChatManager`) on the server with per-project `cwd`, streaming stdout/stderr to clients over a shared WebSocket. This change introduces a similar but much richer pattern: interactive PTY sessions as a first-class per-project resource. The key differences vs. existing spawn patterns:

- PTY requires a **true terminal** (`node-pty`), not `child_process.spawn` — so shells detect a TTY, load rc files, emit escape sequences.
- Stream is **bidirectional and binary** (stdin keystrokes in, raw bytes out including ANSI control codes).
- Session lifetime is **long** and decoupled from any UI interaction — PTY must survive project switches and panel minimize.
- Client rendering needs a **full terminal emulator** (`xterm.js`), not just a log viewer.

Constraints shaping the design:
- The server runs either as a `tsx`-watched Node process (dev) or as a pkg-packaged Node sidecar inside a Tauri `.app` (desktop). Native addons must work in both.
- Existing precedent for bundling a native addon (`better_sqlite3.node`) exists in `build-sidecar.mjs` and the `Module._resolveFilename` hook in `server/index.ts` — `node-pty`'s `pty.node` must follow the same pattern.
- Client code already runs in Vite with React 19; no SSR concerns.
- The existing shared WebSocket at `/ws` is busy with hub events, project events, logs, and chat. We do not want a rogue `ls -R /` to starve the event stream.

## Goals / Non-Goals

**Goals:**
- Real shell sessions per project with `$SHELL` (login+interactive), started in `project.path`.
- Up to 10 concurrent terminals per project, switchable via sidebar, renameable.
- Panel states: hidden / restored / maximized. Drag-resize the top edge. `Cmd+J` to toggle.
- Pixel-perfect chevron alignment between StatusBar (hidden) and panel top-bar (open).
- Zero glitch on project switch, panel minimize, or active terminal switch — xterm instances stay mounted, scrollback preserved, no reinit.
- PTY persists across minimize/maximize/switch; only explicit kill terminates a PTY.
- Cross-platform (mac/linux/win).
- Desktop sidecar packages `pty.node` correctly.

**Non-Goals:**
- Persisting PTYs across server restarts (explicitly scoped out by product).
- Tabs for Problems / Output / Debug / Ports — only Terminal.
- Shell picker (fixed `$SHELL` for this iteration).
- Split terminals / panes.
- Search within scrollback, link highlighting, IME composition — baseline xterm features only.
- Running-process confirmation on kill (explicit user action, direct kill).

## Decisions

### D1: Spawn PTYs on the Node server via `node-pty` (not Rust/Tauri)

Alternative considered: spawn via Tauri Rust side using `portable-pty`. Rejected because:
- The Node server already owns per-project process lifecycle (`QueueManager`, `ChatManager`). Moving terminal ownership to Rust creates a split-brain for `project.path` resolution and project deletion cleanup.
- The same code must work in dev web mode (`npm run dev`) where there is no Rust host — Tauri-only would lose dev parity.
- Native addon packaging precedent already exists in this repo (`better_sqlite3.node`).

Cost: must manage `pty.node` for all supported target triples in the sidecar build.

### D2: Single global `TerminalManager` keyed by session UUID, indexed by `projectId`

Alternative considered: one `TerminalManager` per `ProjectContext` (symmetric with `QueueManager`, `ChatManager`). Rejected because:
- Terminal sessions are genuinely ephemeral and do not interact with per-project DB state.
- A global registry simplifies the WS route (`/ws/terminal/:id`) — session ID is globally unique, no need to resolve project first.
- Project-removal cleanup is a single `byProject.get(id).forEach(kill)` call.
- Cross-project isolation is enforced at the REST/WS auth layer (URL-scoped `projectId` must match session's stored `projectId`).

### D3: Dedicated WebSocket endpoint `/ws/terminal/:id` (binary), NOT the shared `/ws`

Alternative: multiplex on the existing `/ws` with `type: "terminal.data"`. Rejected because:
- PTY throughput is unbounded (`ls -R`, `cat large.log`, `yes`). Mixing with low-frequency JSON events risks backpressure starvation across projects.
- A dedicated socket allows binary frames, avoiding base64 overhead.
- Each terminal gets its own backpressure domain.

The auth token is passed via query string (`?token=...`) since WS does not support custom headers reliably in browsers. This matches the existing pattern.

### D4: Scrollback as a 256 KB server-side ring buffer, replayed on attach

Alternative: use xterm's `SerializeAddon` running headlessly on the server. Rejected as overkill — a raw byte buffer preserves ANSI state correctly because xterm parses the replay the same way it would parse live output. 256 KB covers ~5000 lines of typical terminal output, matches common defaults, and bounds memory per session.

Replay ordering: binary `<scrollback>` frame first, then JSON `{type:"ready"}`, then live frames. The `ready` frame gives the client a deterministic "replay finished" signal without inspecting frame contents.

### D5: Persistent xterm DOM via root-level always-mounted container

This is the critical UX invariant. Options:
1. Render xterm inside the panel; unmount when panel hides → **reinit on every open, scrollback lost.** Rejected.
2. Render xterm inside panel; keep panel in DOM with `display:none` when hidden → works for hidden/visible but breaks on project switch since `ProjectLayout` mounts/unmounts. Rejected.
3. **Render xterm in a root-level `TerminalsHost` component that lives in `App.tsx`, outside any route outlet. Use React portals or direct DOM attach to position the active terminal inside the panel's viewport slot.** Adopted.

Implementation sketch: `TerminalsProvider` holds a `Map<sessionId, { term: Terminal, container: HTMLDivElement }>` in a ref. Each `container` is created via `document.createElement('div')` on session creation and appended to a hidden root `<div id="terminal-host">`. When a session becomes active and the panel is visible, the component responsible for the viewport slot `appendChild`s the container into its own DOM node. On any state change that would hide the terminal, the container is re-parented back to the hidden host. xterm never sees an unmount.

This is effectively how VSCode's workbench handles the terminal renderer panel.

### D6: Panel state model

Per-project state:
```ts
{
  visibility: 'hidden' | 'restored' | 'maximized'
  userHeight: number             // px, persisted
  sessions: TerminalSessionRef[] // ephemeral, re-fetched from server on project focus
  activeId: string | null
}
```

Current rendered height is a derived value:
```
height = visibility === 'hidden' ? 0
       : visibility === 'maximized' ? viewport.height - statusBar.height
       : userHeight
```

`userHeight` is never overwritten by maximize. `visibility` is the single source of truth for what's on screen. Persist `{visibility, userHeight}` per project in `localStorage` under `specrails-hub:terminal-panel:<projectId>`.

### D7: Icon alignment invariant

The top-bar of the panel and the StatusBar MUST have the same height (28px). The collapse chevron and the expand chevron MUST be positioned at identical `right: 8px` with identical button dimensions (24×24). Both buttons' vertical center is `(28 - 24) / 2 = 2px` from the top of their toolbar. Because the StatusBar is the bottom edge of the project viewport and the panel's top-bar sits immediately above it, toggling the panel does not shift the chevron vertically — it shifts vertically by exactly `panelHeight` only when opening/closing. The chevron itself stays at the same `right` pixel.

To guarantee this, both toolbars share a common Tailwind class (`h-7`) and the chevron button shares a common component with fixed dimensions. An integration test (Playwright or Testing Library with a fake layout) asserts the `getBoundingClientRect().right` and `.top` of both chevrons differ only in `panelHeight` between states.

### D8: Keyboard shortcut scope

`Cmd+J` / `Ctrl+J` is registered in `useKeyboardShortcuts` with these guards:
- Only fires when an `activeProject` is set.
- Does not fire when the focused element is `INPUT`, `TEXTAREA`, `[contenteditable]`, or descendant of `[role="dialog"]`.
- On open, the hook dispatches focus to the active xterm via the terminal store's `focusActive()` method.

Existing modals (`AddProjectDialog`, `CommandPalette`, etc.) already use `role="dialog"`, so the guard is free.

### D9: Kill semantics — direct, no confirmation

Trash button and per-terminal close button both call `DELETE /api/projects/:projectId/terminals/:id`. Server sends SIGTERM, waits 2s, sends SIGKILL. Client immediately updates state (optimistic) and closes the WS for that session. No "process still running" prompt — product decision for cognitive lightness.

### D10: Enforcement of the 10-per-project cap on the server

Client disables the `+` button but the cap is authoritative on the server (HTTP 409 on overshoot). Prevents race where user clicks `+` fast before UI updates or opens two hub tabs.

## Risks / Trade-offs

**R1: `node-pty` native addon packaging for the Tauri sidecar.**
→ Mitigation: extend `scripts/build-sidecar.mjs` to locate `node-pty`'s `build/Release/pty.node` (actually `pty.node` in recent versions) and copy it to `src-tauri/binaries/` next to `better_sqlite3.node`. Extend the `Module._resolveFilename` and `process.dlopen` patches in `server/index.ts` to redirect `node-pty`'s binding too. Test on macOS arm64 first (CI target), then verify on x64/linux/win in later pass.

**R2: Native addon breaks `vitest` on some CI environments.**
→ Mitigation: `node-pty` has prebuilt binaries via `node-gyp` cache; install step in CI must run `npm rebuild` if needed. Tests that don't need a real PTY should mock the `TerminalManager`.

**R3: Root-level portal-mounted xterm may conflict with route-level focus trapping or z-index.**
→ Mitigation: the host container uses `position: fixed` with `inset: 0` and `pointer-events: none` when no panel is open. The active terminal's container receives `pointer-events: auto`. Z-index stays below modals.

**R4: Large scrollback replays on slow WS = perceived lag on project switch.**
→ Mitigation: 256 KB payload sent as a single binary frame completes in <10ms on localhost. If profiling shows issues, add `deflate` per-message compression on the WS.

**R5: Drag-resize causes reflow of every visible component above the panel.**
→ Mitigation: use `transform: translateY` during drag if CPU profiling shows issues, then commit final height on drag end. Baseline approach: absolute-positioned panel + `height` change wrapped in `requestAnimationFrame`.

**R6: Windows ConPTY quirks (delayed output flushes, CRLF handling).**
→ Mitigation: `node-pty` abstracts most of this. Initial release targets macOS; Linux/Windows are tested in CI but declared "best effort" until field-tested.

**R7: Shell rc files run arbitrary user code at spawn — a malformed `.zshrc` could hang.**
→ Mitigation: spawn timeout of 5s to `ready` signal. If no first output in 5s, surface a warning to the user but keep the session alive.

## Migration Plan

No migration needed — purely additive.

Rollout steps:
1. Land server `TerminalManager` + WS endpoint behind `process.env.SPECRAILS_TERMINAL_PANEL` feature flag.
2. Land client UI behind a client-side feature flag (`FEATURE_TERMINAL_PANEL`) in `lib/feature-flags.ts`.
3. Enable internally via `.env` for one release cycle.
4. Flip client flag default to `true` in the minor release that also lands desktop sidecar packaging fix.
5. Remove the flag two minor releases later.

## Open Questions

None at this point — product has answered all clarifying questions:
- Fixed shell (`$SHELL`), no picker.
- PTYs die with server, panels reopen empty (no auto-create).
- 10 terminals max.
- All platforms.
- `Cmd+J` focuses active terminal on open.
- Minimize preserves, close kills.
- Kill is direct with no confirmation.
