## ADDED Requirements

### Requirement: Sidebar tri-state mode

Each project sidebar (left `ArcSidebar`, right `ProjectRightSidebar`) SHALL have a `mode` taking exactly one of three values: `pinned-open`, `pinned-collapsed`, `unpinned`. Left and right modes are independent.

#### Scenario: Default mode on first run
- **WHEN** the user opens the hub with no persisted sidebar mode in `localStorage`
- **THEN** both `leftMode` and `rightMode` are `unpinned`

#### Scenario: Persisted mode restored on reload
- **WHEN** `localStorage['specrails-hub:sidebar-mode:left']` is `pinned-collapsed` and the page loads
- **THEN** the left sidebar mounts with `leftMode === 'pinned-collapsed'`

#### Scenario: Invalid persisted value falls back to default
- **WHEN** `localStorage['specrails-hub:sidebar-mode:right']` contains an unrecognised string (e.g., `"foo"`)
- **THEN** the right sidebar mounts with `rightMode === 'unpinned'` and the invalid value is overwritten on the next mode change

### Requirement: Pin button cycles the three modes

Clicking the pin button on a sidebar SHALL cycle its mode in the order `pinned-open → pinned-collapsed → unpinned → pinned-open`. The cycle MUST be the same for the keyboard shortcut bound to that sidebar.

#### Scenario: Cycle from pinned-open
- **WHEN** `leftMode === 'pinned-open'` and the user clicks the left pin button
- **THEN** `leftMode` becomes `pinned-collapsed`

#### Scenario: Cycle from pinned-collapsed
- **WHEN** `leftMode === 'pinned-collapsed'` and the user clicks the left pin button
- **THEN** `leftMode` becomes `unpinned`

#### Scenario: Cycle wraps to pinned-open
- **WHEN** `leftMode === 'unpinned'` and the user clicks the left pin button
- **THEN** `leftMode` becomes `pinned-open`

#### Scenario: Keyboard shortcut shares the cycle
- **WHEN** the user presses the left sidebar keyboard shortcut (currently `⌥⌘B`) while `leftMode === 'pinned-open'`
- **THEN** `leftMode` becomes `pinned-collapsed`, identical to clicking the pin button

#### Scenario: Right sidebar cycle is independent
- **WHEN** the user cycles the left sidebar three times
- **THEN** `rightMode` is unchanged

### Requirement: Hover-reveal gated on unpinned mode

The sidebar SHALL render as a rail mini whenever `mode !== 'pinned-open'`. Hovering the rail SHALL expand the sidebar as an overlay ONLY when `mode === 'unpinned'`. In `pinned-collapsed`, hover MUST NOT change the rendered width or trigger any expansion.

#### Scenario: Unpinned rail expands on hover
- **WHEN** `leftMode === 'unpinned'` and the cursor enters the left rail
- **THEN** the left sidebar expands to its full width

#### Scenario: Unpinned rail collapses on mouse leave
- **WHEN** the left sidebar is expanded via hover (in `unpinned` mode) and the cursor leaves the sidebar
- **THEN** the left sidebar returns to rail mini width

#### Scenario: Pinned-collapsed rail ignores hover
- **WHEN** `leftMode === 'pinned-collapsed'` and the cursor enters the left rail
- **THEN** the left sidebar remains at rail mini width and does not expand

#### Scenario: Pinned-open ignores hover transitions
- **WHEN** `leftMode === 'pinned-open'` and the cursor enters or leaves the sidebar
- **THEN** the left sidebar remains fully expanded and is not affected by mouse movement

### Requirement: Pin button visual state

The pin button icon SHALL appear **lit** (foreground-coloured background highlight) whenever `mode !== 'unpinned'`, and **dim** (muted) when `mode === 'unpinned'`. Both `pinned-open` and `pinned-collapsed` MUST be visually distinguishable from `unpinned` by the pin button alone.

#### Scenario: Lit in pinned-open
- **WHEN** `leftMode === 'pinned-open'`
- **THEN** the left pin button renders with the lit style (e.g., `text-foreground bg-muted`)

#### Scenario: Lit in pinned-collapsed
- **WHEN** `leftMode === 'pinned-collapsed'`
- **THEN** the left pin button renders with the lit style, identical to `pinned-open`

#### Scenario: Dim in unpinned
- **WHEN** `leftMode === 'unpinned'`
- **THEN** the left pin button renders with the dim style (muted foreground, hover-only highlight)

### Requirement: Pin button accessibility labels reflect next action

The pin button's `aria-label` and `title` SHALL describe the action that the next click will perform, based on the current mode.

#### Scenario: Label in pinned-open
- **WHEN** `leftMode === 'pinned-open'`
- **THEN** the left pin button's `aria-label` describes collapsing while keeping pinned (e.g., "Collapse sidebar (keep pinned)")

#### Scenario: Label in pinned-collapsed
- **WHEN** `leftMode === 'pinned-collapsed'`
- **THEN** the left pin button's `aria-label` describes unpinning (e.g., "Unpin sidebar")

#### Scenario: Label in unpinned
- **WHEN** `leftMode === 'unpinned'`
- **THEN** the left pin button's `aria-label` describes pinning open (e.g., "Pin sidebar open")

### Requirement: Mode persistence to localStorage

Whenever a sidebar's mode changes, the new value SHALL be written to `localStorage['specrails-hub:sidebar-mode:left']` or `:right`. Persistence failures (e.g., quota exceeded, private mode) MUST NOT crash or block the UI.

#### Scenario: Successful write
- **WHEN** the user cycles `leftMode` from `unpinned` to `pinned-open`
- **THEN** `localStorage['specrails-hub:sidebar-mode:left']` equals `"pinned-open"`

#### Scenario: Write failure is swallowed
- **WHEN** `localStorage.setItem` throws (e.g., the browser denies writes)
- **THEN** the in-memory mode still updates and the UI reflects the new mode

### Requirement: Command Palette uses the same cycle

The Command Palette entries that toggle the sidebars SHALL invoke the same cycle action used by the pin button and keyboard shortcut. There MUST NOT be a separate code path that flips a boolean.

#### Scenario: Palette cycles left sidebar
- **WHEN** the user activates the "Toggle Left Sidebar" command palette entry while `leftMode === 'pinned-open'`
- **THEN** `leftMode` becomes `pinned-collapsed`, identical to clicking the pin button
