# dashboard-split-layout Specification

## Purpose

TBD - created by promoting delta spec from change `dashboard-postit-morph`. Defines the resizable split layout between `SpecsBoard` and `RailsBoard`, including the three discrete morph tiers (row / card / postit) of the SpecsBoard and the compact premium layout of the RailsBoard at narrow widths.

## Requirements

### Requirement: Vertical splitter between SpecsBoard and RailsBoard

The dashboard SHALL render a draggable vertical splitter between the `SpecsBoard` (left) and `RailsBoard` (right) panels. The splitter MUST allow the user to resize the proportion between the two panels by dragging.

#### Scenario: Default split on first load
- **WHEN** the user opens the dashboard for the first time in a project
- **THEN** the splitter positions both panels at 50/50 width
- **AND** the splitter handle is visually centered

#### Scenario: Drag changes panel widths
- **WHEN** the user drags the splitter handle to the right
- **THEN** the left panel grows in width
- **AND** the right panel shrinks proportionally
- **AND** the change is throttled with `requestAnimationFrame`

#### Scenario: Splitter respects minimum widths
- **WHEN** the user drags the splitter such that either panel would fall below its minimum width
- **THEN** the splitter clamps at the minimum (320px left, 180px right)
- **AND** further drag in that direction is ignored

#### Scenario: Double-click resets split
- **WHEN** the user double-clicks the splitter handle
- **THEN** both panels return to 50/50

### Requirement: Splitter position persists per project

The splitter position SHALL persist in `localStorage` under a per-project key, and SHALL be restored when the user reopens the project.

#### Scenario: Position persisted after drag
- **WHEN** the user finishes dragging the splitter
- **THEN** the resulting left-panel width in pixels is written to `localStorage['specrails-hub:dashboard-split:<projectId>']`

#### Scenario: Position restored on mount
- **WHEN** the dashboard mounts and a persisted value exists for the active project
- **THEN** the splitter restores to that value, clamped to the current viewport's valid range

#### Scenario: Stale value larger than viewport is clamped
- **WHEN** the persisted left-panel width exceeds `viewport - 180px` (right panel minimum)
- **THEN** the value is clamped to `viewport - 180px` on restore
- **AND** the clamped value is written back to `localStorage`

### Requirement: SpecsBoard morphs across three discrete tiers

The `SpecsBoard` SHALL render tickets in one of three visual tiers based on the width of its container, with snap behavior at the breakpoints.

#### Scenario: Row tier when container is narrow
- **WHEN** the left-panel width is ≤ 600px
- **THEN** tickets render as the existing compact row list

#### Scenario: Card tier at intermediate width
- **WHEN** the left-panel width is > 600px and ≤ 900px
- **THEN** tickets render as medium cards in a grid (title + priority + dependency indicator)

#### Scenario: Postit tier at wide widths
- **WHEN** the left-panel width is > 900px
- **THEN** tickets render as square postit cards in a `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))` layout

#### Scenario: Snap at breakpoint
- **WHEN** the user releases the splitter within ±30px of a tier breakpoint (600 or 900)
- **THEN** the splitter animates to the exact breakpoint
- **AND** the corresponding tier is applied

#### Scenario: Tier transition is animated
- **WHEN** the tier changes (e.g. row → card)
- **THEN** each ticket's position and shape transitions smoothly using Framer-Motion `layout` / `layoutId`
- **AND** no full reflow occurs

### Requirement: Postit card shows premium summary view

In the `postit` tier, each ticket SHALL render the following elements in a single card.

#### Scenario: Postit content
- **WHEN** a ticket is rendered as a postit card
- **THEN** the card shows `#<id>` (monospace), title (up to 2 lines), priority pill, dependency indicator (if the ticket has dependencies), `short_summary` (if non-null), and a `Move to Rail` button

#### Scenario: Postit hides summary when absent
- **WHEN** the ticket's `short_summary` is null or empty
- **THEN** the summary slot is omitted entirely (card height adapts)
- **AND** no placeholder text is shown

### Requirement: Move to Rail popover

The postit card's `Move to Rail` button SHALL open a popover listing the rails of the active project. Selecting a rail assigns the ticket to that rail via the same code path used by drag-and-drop ticket-to-rail assignment.

#### Scenario: Popover lists available rails
- **WHEN** the user clicks the `Move to Rail` button on a postit
- **THEN** a popover opens showing each rail's name and current status (idle/running)

#### Scenario: Selecting a rail assigns the ticket
- **WHEN** the user selects a rail from the popover
- **THEN** the ticket is assigned to that rail using the same handler as drag-and-drop
- **AND** the popover closes
- **AND** a confirmation toast is shown

### Requirement: Rails panel uses compact premium layout when narrow

The `RailsBoard` SHALL switch each `RailRow` to a compact premium layout when the right-panel width is below 220px.

#### Scenario: Compact rail card content
- **WHEN** the right-panel width is < 220px
- **THEN** each rail card renders: name (truncated), status dot, Mode dropdown (Implement/Batch), `ProfilePicker` (if the project supports profiles), Play / Stop / Log icon buttons, and an assigned-spec counter

#### Scenario: Compact card visual chrome
- **WHEN** a rail card is in compact mode
- **THEN** it uses semantic theme tokens (`bg-card/80 backdrop-blur`, `border-border/40`, `rounded-xl`, `shadow-sm`)
- **AND** running state borders use `accent-success/40` with a subtle pulse

#### Scenario: Compact mode keeps all functionality
- **WHEN** a rail is in compact mode
- **THEN** Play, Stop, Log, Mode change, and Profile change actions are all reachable and functional

### Requirement: Splitter is disabled on narrow viewports

The dashboard splitter SHALL be disabled when the total viewport width is below 900px, and the left panel SHALL occupy 100% of the available width.

#### Scenario: Mobile / narrow viewport
- **WHEN** the viewport width is < 900px
- **THEN** the splitter is not rendered
- **AND** the `SpecsBoard` occupies 100% width in the `row` tier
- **AND** the `RailsBoard` is reachable via existing alternate UI (no regression)
