## Context

Hub's developer-prerequisites status (Node.js, npm, npx, Git availability) is computed by `server/setup-prerequisites.ts` via `spawnSync(which|where)` and exposed at `GET /api/hub/setup-prerequisites`. The endpoint is consumed only by `client/src/components/SetupWizard.tsx`, which renders a prereq panel and gates the install button. Today the gate fires *after* the user has already gone through `AddProjectDialog` and registered the project in `hub.sqlite`, producing a half-registered project the user cannot complete.

This change moves the gate up-stream into `AddProjectDialog` and adds an OS-aware install-instructions modal, while keeping the existing wizard panel as a defence-in-depth secondary check.

## Goals / Non-Goals

**Goals:**
- Prevent project registration when required tools are missing.
- Surface install instructions contextually, only when needed, with copy-paste commands per OS.
- Single source of truth for prereq state across `AddProjectDialog` and `SetupWizard` (one hook, one component, one cache window).
- Minimum-version awareness so a too-old Node.js is treated as missing rather than passing the basic existence check.
- No regression in `SetupWizard`'s current behaviour.

**Non-Goals:**
- Auto-installing tools for the user (we link out / provide commands; we do not run installers).
- Detecting tools installed in non-PATH locations (NVM shims, custom prefixes) beyond what `which`/`where` already finds.
- Updating prereq status while the modal is closed (re-check is on open, manual button, and `window.focus` only).
- Changing the prereq scope (still Node, npm, npx, Git — same four tools).
- Adding a project despite missing tools (no override flag).
- Touching `SetupWizard`'s existing layout/visual identity beyond swapping its data source for the shared hook.

## Decisions

### Decision: Run the check on dialog open, not on app boot

Boot-time checks would be stale by the time the user clicks "+" minutes later (e.g. they installed Git in the meantime). Per-open with a 60-second cache strikes the balance: instant response on rapid open/close, fresh enough for a long-running app. Rejected: WS push from server when prereqs change — adds infrastructure for a low-frequency event.

### Decision: 60-second client-side cache, hub-scoped

A module-level cache in `usePrerequisites` keyed by nothing (single hub) keeps the implementation trivial. 60s is short enough that a user who installed a tool will see the change with one focus-away/back, long enough to absorb dialog open/close churn. Manual recheck button forces a refetch and bypasses the cache. Cache is in-memory only (lost on page reload), no `localStorage` — staleness across sessions would be confusing.

### Decision: Disable, not hide, the submit button when prereqs are missing

A disabled button + tooltip explains *why* the user can't proceed and points at the fix. Hiding the button would leave the user unsure whether the dialog is broken. The tooltip lists missing tools by name ("Git is required to add a project").

### Decision: "More info" link is conditionally rendered

Premium UX = don't show users problems they don't have. The link only appears in the panel when `prerequisites.ok === false`. Users with a healthy environment see a clean "✓ All required tools detected" line and proceed.

### Decision: OS detection client-side via response field, not `navigator.platform`

The server already runs the check on the host machine, so it knows the OS. Returning `platform: 'darwin' | 'win32' | 'linux'` in the response gives the client an authoritative source. `navigator.platform` is deprecated and unreliable in WebView2/Tauri across Windows ARM64 emulation. Tauri's `os` plugin would work but adds a dependency for a value the server already has.

### Decision: Install instructions modal hosts copy-to-clipboard, not raw text

Each command sits in a code block with a clipboard icon button. Click → write to clipboard → flash a small "Copied" affordance for 1500ms. We use `navigator.clipboard.writeText` with a `document.execCommand('copy')` fallback wrapped in a small util. No new dependency.

### Decision: Show only the host OS's commands by default, with "Show other platforms" disclosure

Users on macOS rarely need the Windows winget commands and vice versa. Showing all platforms creates visual noise. A `<details>`-style disclosure exposes them when truly needed (rare).

### Decision: macOS shows Homebrew first, official second

Most macOS developers have Homebrew. Showing `brew install node git` first matches their muscle memory. The official link is the fallback for users without brew. Detecting whether brew is installed is *not* worth the spawnSync cost — both lines are shown.

### Decision: Minimum-version check is server-side, additive

Add `minVersion` (string) and `meetsMinimum` (boolean) to each `SetupPrerequisite` record. The existing `installed` field is unchanged. The client treats `(installed && meetsMinimum)` as the green path. If a user has Node 14 installed, `installed: true, meetsMinimum: false` is rendered as missing in the UI ("Node.js 14.x found, but 18.0.0 or newer is required") and the "More info" modal still links to the install pages. Minimum versions: Node `>= 18.0.0`, npm `>= 9.0.0`, npx — versionless (ships with npm), Git `>= 2.20.0`.

Version parsing uses a simple `semver`-light comparator — we already need it elsewhere (specrails-core compatibility). If `semver` is already a dep, use it; otherwise an internal `compareVersions(a, b)` is fine for `major.minor.patch`.

### Decision: SetupWizard keeps its panel, refactored to use the shared hook

Removing the wizard panel would shrink the LOC count but lose the defence-in-depth. Server-side install-guard already exists, but a UI-level second pass costs almost nothing now that the hook + component are shared. The wizard prereq fetch (`/api/hub/setup-prerequisites` line 764) is replaced by `usePrerequisites()`.

### Decision: Auto-recheck on `window.focus`, not on visibility change or interval polling

`window.focus` covers the normal "I went to install Node, came back to the app" gesture. `visibilitychange` would also fire on tab-switch in the browser but not desktop, and Tauri windows are typically always visible. Interval polling would burn cycles for nothing.

### Decision: No backend cache layer

`spawnSync(which|where)` for four commands takes <50ms even on Windows. Adding a server cache risks serving stale data after a recheck button click. Client cache is enough.

## Risks / Trade-offs

- **PATH staleness in Tauri** → A user who installs Git while Hub is running may still see "✗ Git" because Tauri inherited the old PATH. Mitigation: the install instructions modal already says "restart SpecRails Hub if PATH changed" (existing text); add a dedicated "I installed it but it still says missing → restart the app" hint when `meetsMinimum === false` and the recheck has been run twice with the same result.
- **Network failure on the prereq fetch** → Don't block the user. If the fetch errors, render an unobtrusive notice ("Could not verify locally — install will validate") and leave the submit button enabled. The server install guard remains the source of truth before spawning.
- **Older specrails-core that requires lower Node** → minVersion is hard-coded to current specrails-core requirements. If specrails-core lowers them, we update both. Not a moving target in practice.
- **`navigator.clipboard` blocked** → In some sandbox modes clipboard write requires a user gesture; we always trigger inside a click handler so this is satisfied. Fallback to `document.execCommand('copy')` covers older WebViews.
- **Race between prereq check and dialog close** → If the user closes the dialog before the fetch resolves, `setSetupPrerequisites` runs against an unmounted component. `usePrerequisites` aborts the in-flight `AbortController` on unmount.
- **Coverage drift** → New components add lines without tests = ratio drop. Each new file ships with a unit test; counts hold.

## Migration Plan

1. Land server changes (`minVersion`, `meetsMinimum`, `platform` fields) — additive, deployable independently of client.
2. Land shared hook + component (`usePrerequisites`, `PrerequisitesPanel`, `InstallInstructionsModal`) with their own tests.
3. Refactor `SetupWizard` to use the shared pieces — prove parity by running existing wizard tests.
4. Wire up `AddProjectDialog` — add the gate, the modal, the disabled-button tooltip.
5. Run `npm run typecheck && npm test`; smoke test in `npm run dev`.

**Rollback:** Revert the merge commit. No persistent state changes; the only schema-style change is in the prereq response, which is additive and tolerated by the existing client.

## Open Questions

- **Q:** Do we want a "Don't show this again" option for users who knowingly run with a lower Node version? **A (default):** No. Premium UX = the gate is firm; if the user wants to use specrails on a lower Node, they bump Node.
- **Q:** Should the install instructions modal also surface the *current* version next to the *required* version? **A (default):** Yes — improves clarity. ("Node.js 16.20.0 found — needs 18.0.0+")
- **Q:** Tauri exposes the host OS via `@tauri-apps/api/os` — should we use it as a tiebreaker if the server `platform` field is missing on an old build? **A (default):** No — the server change is additive and ships in the same release; no version skew expected.
