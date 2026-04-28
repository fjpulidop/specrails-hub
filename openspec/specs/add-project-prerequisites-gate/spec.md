# add-project-prerequisites-gate Specification

## Purpose

Gate the "Add project" flow on local developer prerequisites (Node.js, npm, npx, Git) so users see a clear, OS-aware installation panel before submitting, while keeping the server-side install guard as the authoritative check. A single shared hook (`usePrerequisites`) and panel component (`<PrerequisitesPanel />`) drive both `AddProjectDialog` and `SetupWizard`.

## Requirements

### Requirement: AddProjectDialog runs a prerequisites check on open
The "Add project" dialog SHALL invoke the prerequisites status fetch (`GET /api/hub/setup-prerequisites`) every time it transitions from closed to open, subject to a 60-second client-side cache.

#### Scenario: First open within a session
- **WHEN** the user clicks the "+" button to open `AddProjectDialog` for the first time after page load
- **THEN** the dialog issues `GET /api/hub/setup-prerequisites`
- **AND** while the response is in flight, the prerequisites panel renders a loading skeleton

#### Scenario: Re-open within the cache window
- **WHEN** the dialog is closed and re-opened within 60 seconds of a successful previous fetch
- **THEN** the cached status is rendered immediately
- **AND** no new request to `/api/hub/setup-prerequisites` is made

#### Scenario: Re-open after the cache window
- **WHEN** the dialog is opened more than 60 seconds after the previous fetch
- **THEN** a fresh request to `/api/hub/setup-prerequisites` is issued

#### Scenario: Network failure does not block the user
- **WHEN** the prereq fetch fails (network error, non-2xx response)
- **THEN** the panel renders an unobtrusive notice such as "Could not verify locally — install will validate"
- **AND** the "Add project" submit button remains enabled
- **AND** the existing server-side install guard remains the authoritative check

### Requirement: Prerequisites panel renders status per tool
The dialog SHALL display, for each required tool (Node.js, npm, npx, Git), a row showing the tool's status.

#### Scenario: Tool is installed and meets the minimum version
- **WHEN** a tool's response record has `installed: true` and `meetsMinimum: true`
- **THEN** the row renders a green check icon, the tool label, and the detected version

#### Scenario: Tool is installed but below the minimum version
- **WHEN** a tool's record has `installed: true` and `meetsMinimum: false`
- **THEN** the row renders a red cross icon
- **AND** the row text reads "<Tool> <currentVersion> found — needs <minVersion>+"
- **AND** the tool is treated as missing for gating purposes

#### Scenario: Tool is not installed
- **WHEN** a tool's record has `installed: false`
- **THEN** the row renders a red cross icon and the tool label

#### Scenario: All tools are healthy
- **WHEN** every required tool is `installed && meetsMinimum`
- **THEN** the panel renders a single line "All required tools detected" without listing each tool individually

### Requirement: Submit button is gated on prerequisites
The "Add project" submit button SHALL be disabled while any required tool is missing or below its minimum version.

#### Scenario: Tools missing
- **WHEN** at least one required tool is missing or below the minimum version
- **THEN** the "Add project" button is rendered with `disabled` set to true
- **AND** hovering the button reveals a tooltip naming the missing tools (e.g. "Git is required to add a project")

#### Scenario: All tools healthy
- **WHEN** all required tools are present and meet the minimum versions
- **AND** the rest of the form (path, name, provider) is valid
- **THEN** the "Add project" button is enabled

#### Scenario: Prereq check still pending
- **WHEN** the prereq fetch is in flight on first open
- **THEN** the submit button is disabled until the response arrives or fails

### Requirement: "More info" affordance appears only when needed
The dialog SHALL render a "More info" link or button **only when at least one required tool is missing**. Healthy environments SHALL NOT render the affordance.

#### Scenario: Missing tool present
- **WHEN** the prereq status reports `ok: false`
- **THEN** a "More info" affordance is rendered next to the panel
- **AND** clicking it opens `InstallInstructionsModal`

#### Scenario: All tools healthy
- **WHEN** the prereq status reports `ok: true`
- **THEN** no "More info" affordance is rendered

### Requirement: InstallInstructionsModal surfaces OS-aware install commands
The install-instructions modal SHALL display copy-paste install commands for the host operating system, with an expandable section to view other platforms.

#### Scenario: macOS host
- **WHEN** the modal opens on a host where the prereq response reports `platform: "darwin"`
- **THEN** the macOS section is the visible default
- **AND** the section shows `brew install node git` as the recommended one-liner
- **AND** the section also links to `https://nodejs.org/en/download` and `https://git-scm.com/downloads` as fallback options
- **AND** other platform sections (Windows, Linux) are hidden behind a "Show other platforms" disclosure

#### Scenario: Windows host
- **WHEN** `platform: "win32"`
- **THEN** the Windows section is the visible default
- **AND** the section shows `winget install OpenJS.NodeJS.LTS` and `winget install Git.Git`
- **AND** the section also links to `https://nodejs.org/en/download` and `https://git-scm.com/download/win`
- **AND** the section reminds the user to restart SpecRails Hub so PATH refreshes

#### Scenario: Linux host
- **WHEN** `platform: "linux"`
- **THEN** the Linux section is the visible default with apt and dnf snippets
- **AND** the official download links are listed as fallbacks

#### Scenario: Copy command to clipboard
- **WHEN** the user clicks the copy-to-clipboard button on any command
- **THEN** the command text is written to the clipboard via `navigator.clipboard.writeText`
- **AND** a brief "Copied" affordance appears for ~1500ms
- **AND** the button falls back to `document.execCommand('copy')` if the clipboard API is unavailable

### Requirement: Auto-recheck after the user installs a tool
The dialog SHALL re-fetch the prereq status when the user is likely to have just installed a tool, without requiring them to close and re-open the dialog.

#### Scenario: Window regains focus
- **WHEN** the dialog is open and the application window receives a `focus` event
- **THEN** the prereq cache is invalidated and a fresh fetch is issued

#### Scenario: Manual recheck button
- **WHEN** the install-instructions modal is open and the user clicks "I installed it, recheck"
- **THEN** the cache is invalidated and a fresh fetch is issued
- **AND** the panel re-renders with the new status

### Requirement: Shared prerequisites hook used by both surfaces
A single hook (`usePrerequisites`) SHALL provide the prereq status, loading state, and recheck function. Both `AddProjectDialog` and `SetupWizard` SHALL consume this hook so they share fetch dedup, cache, and recheck behaviour.

#### Scenario: Dialog and wizard share state
- **WHEN** `AddProjectDialog` and `SetupWizard` are mounted in the same session
- **THEN** opening one after the other within the cache window does not trigger a second fetch

#### Scenario: Recheck propagates
- **WHEN** the modal's recheck button is clicked while the wizard is also rendered
- **THEN** the wizard's prereq panel reflects the new status without an additional explicit fetch

### Requirement: Server response carries platform and version metadata
`GET /api/hub/setup-prerequisites` SHALL return, in addition to the existing fields:

- `platform: "darwin" | "win32" | "linux"` at the response root.
- `minVersion: string` per `SetupPrerequisite` record (semver, `major.minor.patch`).
- `meetsMinimum: boolean` per `SetupPrerequisite` record (true when `installed && parsedVersion >= minVersion`; false otherwise).

The existing `installed`, `version`, `installUrl`, `installHint`, `required`, `key`, `label`, `command`, and `ok` semantics are preserved.

#### Scenario: Node 18.0.0 installed
- **WHEN** Node v18.0.0 is on PATH
- **THEN** the Node record reports `installed: true, meetsMinimum: true, version: "v18.0.0", minVersion: "18.0.0"`

#### Scenario: Node 14.x installed
- **WHEN** Node v14.21.3 is on PATH
- **THEN** the Node record reports `installed: true, meetsMinimum: false, version: "v14.21.3", minVersion: "18.0.0"`

#### Scenario: Tool absent
- **WHEN** Git is not on PATH
- **THEN** the Git record reports `installed: false, meetsMinimum: false`
- **AND** `version` is undefined

#### Scenario: Platform tag matches host
- **WHEN** the server runs on macOS
- **THEN** the response root contains `platform: "darwin"`

### Requirement: SetupWizard reuses the shared panel
`SetupWizard` SHALL render its prerequisites status via `<PrerequisitesPanel />` driven by `usePrerequisites()` rather than its own inline fetch.

#### Scenario: Wizard mounts
- **WHEN** the user reaches the install step of `SetupWizard`
- **THEN** `usePrerequisites()` provides the status and the wizard renders `<PrerequisitesPanel />`
- **AND** the wizard's existing install-button gate (`installDisabled`) continues to require `prerequisites.ok`

#### Scenario: Wizard install path remains gated server-side
- **WHEN** prerequisites are missing
- **THEN** the wizard's install button is disabled (UI gate)
- **AND** the server's install guard would still reject the spawn if the UI gate is bypassed
