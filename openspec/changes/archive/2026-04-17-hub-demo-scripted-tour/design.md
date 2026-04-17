## Context

The hub-demo build (`client/vite.demo.config.ts` → `dist-demo/`) serves a statically hosted copy of the real client with fetch and WebSocket patched to return fixtures. It is embedded in a cross-origin iframe on specrails-web.

Today the iframe looks dead: no motion, no narrative. This change introduces an auto-playing scripted tour that drives the real UI through a canonical user journey, on an infinite loop, so a landing-page visitor sees the product in action without clicking anything.

Constraints:
- Must run inside the existing demo iframe — cross-origin from specrails-web.
- Must not ship into the production client bundle.
- Must drive the real components (ProposeSpecModal, RailRow, LogViewer), not re-implementations, to avoid UI drift as the product evolves.
- Must degrade gracefully for `prefers-reduced-motion`.

## Goals / Non-Goals

**Goals:**
- Play a canonical `Propose Spec → run Rail 1 → view log` journey on loop, on its own, no user input.
- Synthetic cursor glides between real DOM nodes (resolved at runtime via `getBoundingClientRect`, not hardcoded coordinates).
- Tour ~18 seconds per loop, feels alive, not frantic.
- Log panel tails a fixed, representative set of pipeline lines drawn from real output.
- Zero impact on the production client bundle.
- Zero impact on the real-hub runtime (no code paths active outside demo mode).

**Non-Goals:**
- User interaction with the iframe. V1 is pure "showreel" — no hover-pause, no click-to-restart.
- Multi-locale / i18n for tour copy. Copy is English only in v1.
- Cross-origin postMessage control from the parent page. Tour is self-contained; specrails-web does not orchestrate it.
- Recording a real video / gif. That's Path B, explicitly rejected.
- Realistic simulated backend (jobs table grows, status websocket messages, etc). Tour fakes just enough state to match the beats.

## Decisions

### Decision 1: Beat timeline is a typed TS module, not JSON
The timeline lives in `client/src/demo-mode/tour/timeline.ts` as a typed `Beat[]`. Reason: co-located tests, editor autocomplete, type-check catches selector typos. JSON would make tuning painful and tempt drift between "what the timeline says" and "what the orchestrator can execute".

```ts
type BeatId = string
type Beat =
  | { id: BeatId; kind: 'moveTo'; selector: string; duration: number }
  | { id: BeatId; kind: 'click'; selector: string; duration: number }
  | { id: BeatId; kind: 'type'; selector: string; text: string; duration: number }
  | { id: BeatId; kind: 'wait'; duration: number }
  | { id: BeatId; kind: 'fadeReset'; duration: number }
```

### Decision 2: Canonical 15-beat tour (approved in explore)
Beats match the list locked during `/opsx:explore`. Summary:

```
 01 idle parked · 1.0s
 02 moveTo[+ Propose Spec] · 1.2s
 03 click[propose-spec-button] · 0.6s
 04 moveTo[spec textarea] + focus · 0.4s
 05 type "Add JWT auth with refresh..." · 2.5s
 06 click[generate-spec-button] · 0.8s
 07 wait (modal dismiss + toast) · 0.8s
 08 wait (spec card appears) · 0.6s
 09 wait (spec slides Specs → Rail 1) · 0.9s
 10 moveTo[rail-1 play] + click · 0.8s
 11 wait (status idle → running) · 0.5s
 12 moveTo[rail-1 logs] + click · 0.8s
 13 wait (log drawer opens) · 0.5s
 14 wait (log lines tail in) · 4.5s
 15 fadeReset · 0.9s
```
Total loop ≈ 18s.

### Decision 3: Synthetic cursor is an absolute-positioned SVG
A single `<svg>` mounted at the app root, `pointer-events: none`, `position: fixed`, `z-index: 2147483000`. Movement is a CSS `transform: translate(x, y)` transition with `cubic-bezier(0.22, 1, 0.36, 1)` for easing. Target coordinates are computed per-beat via `element.getBoundingClientRect()` + a configurable offset. Click beats animate a brief `scale(0.9)` pulse on the cursor plus a small ripple in the target element.

Alternatives considered:
- HTML div with `background-image: url(cursor.png)` — pixel art would not scale crisply.
- Native mouse events via `dispatchEvent(MouseEvent)` on the real cursor — cannot render anywhere that respects pointer-events, and does not help with "show the cursor moving".

### Decision 4: Tour controls real components via `programmaticMode`
The tour does not call fetch, does not dispatch WebSocket messages, and does not simulate physics. Instead, each affected component accepts an optional `programmaticMode` prop (or reads a context) that lets the tour advance state directly:

- `ProposeSpecModal`: `programmaticMode` → skips real API call on submit, emits a prebuilt success result.
- `RailRow` / `RailControls`: `programmaticMode` → `play()` bypasses the queue dispatcher and immediately transitions local UI state to `running`.
- `LogViewer`: `programmaticMode` → ignores the real log stream and reads lines from a tour-supplied generator.

This keeps the tour's surface area small (the components still render themselves, still animate their own transitions) while giving the orchestrator deterministic control.

Alternatives considered:
- Tour fires real click/keydown events on elements. Fragile: any field-level validation, debounce, or animation hitching would misfire the beats. The whole point of "programmatic" is determinism.
- Tour calls into Zustand / context stores directly. Bypasses the components the visitor sees and tightly couples tour to store internals.

### Decision 5: Log tailing uses a fixed canonical line set
Lines come from a single fixtures file `client/src/demo-mode/fixtures/tour-log.ts` (see below). The log-stream driver feeds one line per ~400ms during Beat 14. Fixed, not randomised, so the experience is stable across loops and easy to screenshot.

Seed lines (trimmed from the real pipeline log the user provided):
```
17:16:42  ✓ Environment Setup
17:23:21  → Phase 3a: Architect
17:23:35  ✓ OpenSpec artifacts created
17:26:15  → Phase 3b: Implement
17:26:24  ✓ Build passes · 5 files modified
17:26:51  → Phase 3c: Write Tests
17:31:11  ✓ 152 tests passing
17:34:02  → Phase 4b: Review
17:39:10  ✓ 3 warnings resolved
17:39:32  → Phase 4c: Ship
17:40:39  ✓ SHIPPED · confidence 87/100
```

Colour tokens (from existing dracula palette):
- `✓` → `text-dracula-green`
- `→` → `text-dracula-purple`
- timestamps → `text-muted-foreground`
- trailing numbers / counts → `text-dracula-cyan`
- `SHIPPED` / `PASS` → `text-dracula-green font-semibold`

### Decision 6: Demo-only compile guard
The tour code is imported only from `demo-entry.tsx`. Both the tour module and the `programmaticMode` prop usage are gated behind `import.meta.env.MODE` so the production client build tree-shakes them. Concretely:

- `programmaticMode` prop exists in production code as an optional typed prop whose default is `false`; when `false` the existing code path runs unchanged.
- The tour orchestrator file is only imported from `demo-entry.tsx`, so the production entry `main.tsx` never pulls it in.

Result: production bundle is unchanged modulo a few extra optional-prop type declarations.

### Decision 7: Infinite loop, no pause, no external control
Per the voicebox pattern: loop continuously, no hover-pause, no postMessage from the parent. Reduces surface area and matches what the embedding page actually needs (a moving hero, not an interactive demo).

Exception: `prefers-reduced-motion: reduce` — orchestrator detects this once at boot and renders only the first beat (idle dashboard), no cursor, no tailing. Accessibility win for ~5 lines.

### Decision 8: Beat timing uses wall-clock `setTimeout`, not animation-frame counters
Beats are sequential and human-readable in their durations. A single `setTimeout` chain (or `await sleep(ms)` in an async function) is clearer than a rAF-driven state machine, and the visual smoothness comes from the CSS transitions, not the orchestrator tick.

### Decision 9: Tour starts after hub-demo hydration settles
The existing `demo.html:7-24` inline script waits 500ms post-load to hide chat/footer/toasts. The tour orchestrator hooks into `load` as well but adds an extra `requestIdleCallback` (with a 1s timeout fallback) before starting Beat 01, so DOM layout is stable and `getBoundingClientRect` targets are accurate.

## Risks / Trade-offs

- **[Selector drift — a component renames its data-testid and the tour silently breaks]** → All selectors live in one file `tour/selectors.ts`. A vitest unit test mounts the demo entry and asserts every selector resolves to exactly one DOM node; CI fails on drift.
- **[Layout shift during boot causes cursor to click wrong coordinates]** → Tour waits for `requestIdleCallback` before Beat 01. Any subsequent layout shift (e.g., font loading) is absorbed because `getBoundingClientRect` is called at beat execution time, not ahead-of-time.
- **[Log line timing looks robotic]** → Use slight jitter per line (±50ms) so cadence is organic without feeling random.
- **[Loop restart feels jarring]** → Beat 15 `fadeReset` briefly fades the viewport to black (0.3s) and resets component state (close modal, empty log, clear spec card) before looping. One visible "blink" is better than a jump cut.
- **[`programmaticMode` introduces dead code paths in production]** → Mitigated by making the prop optional with `false` default. Unit tests cover both branches. Bundle impact measured post-MVP; if non-trivial, move to a context-only API.
- **[Multiple iframes on a page run multiple tours, fighting over tab audio / focus]** → Tour uses no audio and does not touch document.title. Safe.

## Migration Plan

1. Land the new `tour/` module + fixtures + `programmaticMode` prop additions behind the demo build. Run locally against `vite.demo.config.ts`.
2. Build `dist-demo/` and manually copy to `specrails-web/public/hub-demo/` (existing flow). Confirm the existing iframe in `HubShowcase.tsx` renders the tour.
3. No rollback concern: if the tour breaks, revert the `dist-demo` copy on the web side. The real hub client is unaffected either way.

## Open Questions

- Should the tour expose a `window.__tourPause()` debug hook for screenshots? Leaning yes, tiny cost, useful for marketing. Add in v1.
- Should the tour restart instantly after Beat 15, or hold the idle state for 1–2s before re-entering Beat 02? 1s hold feels less manic. Spec it as a 1s hold.
- Spec 3 may want to surface the tour's current beat to the parent (for side captions like "Step 3: Run the rail"). Out of scope for v1; would need postMessage, revisit later.
