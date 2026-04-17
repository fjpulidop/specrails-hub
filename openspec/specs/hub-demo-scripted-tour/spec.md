# hub-demo-scripted-tour Specification

## Purpose
TBD - created by archiving change hub-demo-scripted-tour. Update Purpose after archive.
## Requirements
### Requirement: Tour auto-plays on hub-demo boot
When the hub-demo build is loaded in a browser, the tour SHALL start automatically after the DOM has stabilised and SHALL require no user input to begin.

#### Scenario: Tour starts without interaction
- **WHEN** `/hub-demo/index.html` is loaded in a browser
- **THEN** within 2 seconds of the page's `load` event, the synthetic cursor is visible and Beat 02 (moveTo `+ Propose Spec` button) has started

#### Scenario: Tour does not start in production client
- **WHEN** the production client is loaded (any route served from `server/` or `dist/`, not `dist-demo/`)
- **THEN** no synthetic cursor is rendered and no tour code executes

### Requirement: Tour follows the canonical 15-beat timeline
The tour SHALL execute beats in the following order and SHALL produce the corresponding user-visible effect for each beat. Total loop duration SHALL be approximately 18 seconds (±1 second).

| Beat | Effect |
| ---- | ------ |
| 01 | Cursor is idle in a parked position; dashboard is in its default state |
| 02 | Cursor glides to the Propose Spec button |
| 03 | Cursor clicks the Propose Spec button; Propose Spec modal opens |
| 04 | Cursor focuses the spec description textarea |
| 05 | Description is typewritten into the textarea |
| 06 | Cursor clicks the Generate Spec submit button |
| 07 | Modal dismisses; a toast indicating spec creation is visible |
| 08 | A new spec card appears in the Specs column |
| 09 | The spec card transitions visually from the Specs column to Rail 1 |
| 10 | Cursor clicks the Play control on Rail 1 |
| 11 | Rail 1 status changes from idle to running |
| 12 | Cursor clicks the Logs control on Rail 1 |
| 13 | Log viewer for Rail 1 opens |
| 14 | Log lines appear one at a time in the log viewer |
| 15 | A brief fade resets the UI to Beat 01 state |

#### Scenario: Timeline executes in order
- **WHEN** the tour is running
- **THEN** Beat N does not begin until Beat N-1 has completed

#### Scenario: Loop duration is near 18 seconds
- **WHEN** the tour runs one full loop from Beat 01 start to Beat 15 end
- **THEN** the elapsed wall-clock time is between 17 and 19 seconds inclusive

### Requirement: Tour loops indefinitely
The tour SHALL loop continuously for as long as the hub-demo document is visible. The tour SHALL NOT require any user input to restart.

#### Scenario: Loop continues past one iteration
- **WHEN** the tour has completed Beat 15
- **THEN** within 1 second it re-enters Beat 01 and continues executing beats

### Requirement: Synthetic cursor is visible and moves smoothly
The tour SHALL render a synthetic cursor as a single SVG element that is independent of the operating-system cursor. The synthetic cursor SHALL move between target coordinates using a CSS transition whose duration matches the current beat's `duration`. The synthetic cursor SHALL NOT receive pointer events (CSS `pointer-events: none`).

#### Scenario: Cursor is a synthetic overlay
- **WHEN** the tour is running
- **THEN** exactly one element with role of synthetic tour cursor is present in the DOM and it has `pointer-events: none` and is positioned using fixed/absolute coordinates

#### Scenario: Cursor animates between beats
- **WHEN** Beat N is a `moveTo` beat targeting a selector S
- **THEN** the synthetic cursor's centre ends within 2 CSS pixels of S's bounding rect centre (plus the configured per-beat offset) by the time Beat N+1 starts

### Requirement: Selector resolution is verified by CI
Every selector consumed by the tour SHALL resolve to exactly one DOM node in the hub-demo build. The project SHALL include an automated test that fails the build if any tour selector is missing or ambiguous.

#### Scenario: Missing selector fails CI
- **WHEN** a component used by the tour is renamed or removed such that one of its `data-testid` / aria selectors no longer resolves
- **THEN** the tour selector unit test fails

#### Scenario: Ambiguous selector fails CI
- **WHEN** a change in the demo build causes a tour selector to match more than one element
- **THEN** the tour selector unit test fails

### Requirement: Programmatic mode bypasses real side effects
Components driven by the tour SHALL accept an opt-in programmatic mode that causes user actions to advance UI state without invoking the underlying API or queue dispatcher. Components SHALL default to their normal (non-programmatic) behaviour when the flag is absent.

#### Scenario: Propose Spec modal submit is programmatic
- **WHEN** the tour submits the Propose Spec modal in programmatic mode
- **THEN** no network request is issued and the modal closes with the canonical success outcome (new spec card rendered)

#### Scenario: Rail play is programmatic
- **WHEN** the tour clicks Rail 1's Play control in programmatic mode
- **THEN** no queue dispatch is invoked and Rail 1 immediately transitions to running status in the UI

#### Scenario: Log viewer reads tour source
- **WHEN** the tour opens the log viewer in programmatic mode
- **THEN** the log viewer renders lines provided by the tour log source, not from the real (mocked) websocket or fetch

#### Scenario: Production default is unchanged
- **WHEN** a component that supports programmatic mode is rendered in the production client (non-demo build)
- **THEN** it behaves identically to how it behaved before the introduction of programmatic mode

### Requirement: Log content uses the canonical tour line set
During Beat 14, the log viewer SHALL render the canonical tour log lines from `client/src/demo-mode/fixtures/tour-log.ts`, one at a time, in order, with approximately 400 ms between lines.

#### Scenario: Canonical lines render in order
- **WHEN** Beat 14 is running
- **THEN** each of the 11 canonical lines appears in order, separated by 300–500 ms, with the final line `SHIPPED · confidence 87/100` (or equivalent wording) being the last rendered line

#### Scenario: Colour tokens applied
- **WHEN** a line beginning with `✓` is rendered
- **THEN** the `✓` is coloured with the green dracula token

- **WHEN** a line beginning with `→` is rendered
- **THEN** the `→` is coloured with the purple dracula token

### Requirement: Reduced motion disables animation
When the user's system or browser advertises `prefers-reduced-motion: reduce`, the tour SHALL NOT animate.

#### Scenario: Reduced motion at boot renders idle state only
- **WHEN** `prefers-reduced-motion: reduce` is set and `/hub-demo/index.html` is loaded
- **THEN** the tour does not render the synthetic cursor, does not begin the timeline, and the hub-demo displays a static idle state (Beat 01 visuals only)

### Requirement: Tour ships only in the demo build
The tour orchestrator module, synthetic cursor, and programmatic-mode tour sources SHALL NOT be included in the production client bundle.

#### Scenario: Production bundle excludes tour code
- **WHEN** the production client is built via `npm run build` at the repository root
- **THEN** the resulting `client/dist/` JavaScript does not contain the tour orchestrator module or the tour log source

#### Scenario: Demo bundle includes tour code
- **WHEN** the demo client is built via the Vite demo config
- **THEN** the resulting `client/dist-demo/` bundle contains the tour orchestrator module

### Requirement: Debug pause hook
The tour SHALL expose a debug pause hook on `window.__specrailsTour` that can pause and resume the tour at any time. This hook is intended for screenshots and marketing captures; it is not required for normal operation.

#### Scenario: Pause and resume
- **WHEN** `window.__specrailsTour.pause()` is called during any beat
- **THEN** the current beat completes any in-flight transition and the timeline halts until `window.__specrailsTour.resume()` is called, at which point the next beat begins

