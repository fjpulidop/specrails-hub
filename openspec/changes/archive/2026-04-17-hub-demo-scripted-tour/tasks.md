## 1. Tour Module Scaffolding

- [x] 1.1 Create `client/src/demo-mode/tour/` with subfiles. Shipped: `timeline.ts`, `selectors.ts`, `orchestrator.ts`, `TourCursor.tsx`, `TourOverlay.tsx`, `tour-store.ts`, `tour.css`, `index.ts`, `README.md`. Log-stream logic was folded into `orchestrator.ts` + `tour-store.ts` rather than living in a dedicated file.
- [x] 1.2 Define the `Beat` discriminated union in `timeline.ts` (`idle`, `moveTo`, `click`, `type`, `wait`, `action`, `fadeReset`)
- [x] 1.3 Populate `timeline.ts` with the 15-beat canonical timeline from design §Decision 2
- [x] 1.4 Populate `selectors.ts` with one exported constant per selector used by the tour

## 2. Synthetic Cursor

- [x] 2.1 Implement `TourCursor.tsx` as a single `<svg>` element positioned via CSS `transform: translate3d()`; mounted at the demo-entry root with `pointer-events: none`, `position: fixed`, and a very high `z-index`
- [x] 2.2 Drive position via `useSyncExternalStore(tourStore)` + CSS transition `duration` of 800 ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`
- [x] 2.3 Implement a `click` visual: brief `scale(0.9)` pulse on the cursor + ripple ring at target coordinates (`tour-click-ring` keyframe)
- [x] 2.4 Expose a small imperative API — implemented via `tourStore.update({ cursorX, cursorY, clickPulse })` rather than a cursor-local API, which keeps the cursor component stateless.

## 3. Programmatic Mode Plumbing

- [~] 3.1 Optional `programmaticMode?: boolean` prop on `ProposeSpecModal.tsx` — **DEFERRED**: replaced by a pure-overlay architecture (see design note below). The tour renders its own fake modal rather than driving the real one. Revisit if the fake modal visibly drifts from the real one.
- [~] 3.2 `programmaticMode` on `RailControls.tsx` / `RailRow.tsx` — **DEFERRED** for the same reason.
- [~] 3.3 `programmaticMode` + `programmaticSource` on `LogViewer.tsx` — **DEFERRED** for the same reason.
- [x] 3.4 Verify production behaviour unchanged — production build (`npm run build`) contains no reference to `tourStore`, `TourCursor`, or `__specrailsTour`; the tour module is tree-shaken out because it is imported only from `demo-entry.tsx`.

_Design note_: during implementation the 3-component `programmaticMode` path was traded for a lighter overlay approach — the tour renders synthetic modal / spec card / rail / log drawer visuals next to the real hub. Pros: zero production-component risk, no backend mocking required. Cons: as the real hub UI evolves, the overlay can drift. Mitigation is to re-check the overlay visuals whenever the real modal / rail / log chrome change significantly.

## 4. Fixtures

- [x] 4.1 Create `client/src/demo-mode/fixtures/tour-log.ts` exporting the 11 canonical log lines from design §Decision 5
- [x] 4.2 Create `client/src/demo-mode/fixtures/tour-spec.ts` exporting the canonical Propose Spec description text and the resulting new-spec payload

## 5. Orchestrator

- [x] 5.1 Implement `orchestrator.ts` with an async `runLoop()` that iterates beats sequentially, awaiting each beat's `duration`
- [x] 5.2 For each `moveTo` beat, resolve the selector, compute `getBoundingClientRect()`, and update `tourStore.{cursorX, cursorY}`
- [x] 5.3 For each `click` beat, increment `tourStore.clickPulse` to trigger the ripple animation
- [x] 5.4 For `type` beats, animate character-by-character insertion into `tourStore.typedText`
- [x] 5.5 For `fadeReset`, fade the viewport (`tourStore.fadeOpacity`), then `tourStore.softReset()` to clear modal, spec card, rail running, log drawer, and fade out
- [x] 5.6 Wrap `runLoop()` in an infinite loop with a 1-second hold between iterations
- [x] 5.7 Detect `prefers-reduced-motion: reduce` once at boot in `startTour()`; when present, do not start the loop and leave `cursorVisible: false` (idle state only)

## 6. Demo Entry Integration

- [x] 6.1 In `demo-entry.tsx`, mount `<TourOverlay/>` and `<TourCursor/>` alongside `<App/>`, then call `startTour()` inside `requestIdleCallback` (with a 400 ms timeout fallback)
- [x] 6.2 Tour orchestrator is imported only from `demo-entry.tsx`; production entry `main.tsx` does not reference the tour module, so the production Vite build tree-shakes it (verified in tasks §8.4)
- [x] 6.3 Expose `window.__specrailsTour = { pause, resume }` for debug / screenshot capture

## 7. Tests

- [ ] 7.1 Vitest unit test: mount the demo-entry root, iterate every selector in `selectors.ts`, assert each resolves to exactly one element — **DEFERRED**: the full demo-entry cannot mount cleanly in jsdom (requires the mock WebSocket + fetch plumbing). Lightweight selector lookup test would still be valuable; follow-up.
- [ ] 7.2 Vitest unit test: running the timeline in fake-timers advances state through all 15 beats and returns to Beat 01 — **DEFERRED**: depends on timer plumbing in the orchestrator, follow-up.
- [ ] 7.3 Vitest unit test: when `matchMedia('(prefers-reduced-motion: reduce)').matches` is true, the orchestrator does not start — **DEFERRED**: follow-up.
- [x] 7.4 Production build (`npm run build`) does not contain `__specrailsTour` — verified manually (`grep -l "__specrailsTour" client/dist/assets/*.js` returns no matches); demo build does contain it.

## 8. Build & Integration Verification

- [x] 8.1 Run `npx vite build --config vite.demo.config.ts` — success; `dist-demo/` produced; chunks sized normally.
- [ ] 8.2 Serve `dist-demo/` locally and visually confirm one full loop plays correctly within ~18 seconds — **DEFERRED**: requires a browser-in-the-loop; left for a visual QA pass after merge.
- [ ] 8.3 Copy `dist-demo/*` into a local checkout of `specrails-web/public/hub-demo/` and verify the iframe in `HubShowcase` renders the tour — **DEFERRED**: cross-repo copy is part of the hero-redesign-hub-primary change (Spec 3).
- [x] 8.4 Production build (`npm run build`) produces no tour cursor overlay — verified: `dist/assets/*.js` contain no reference to `__specrailsTour`, `TourCursor`, or `TourOverlay`.

## 9. Documentation

- [x] 9.1 README for the demo-mode tour: `client/src/demo-mode/tour/README.md` covering architecture, beat list, selectors, debug hook.
- [x] 9.2 Inline `openspec: hub-demo-scripted-tour` comment at the top of each new tour file pointing back to the change id.
