## ADDED Requirements

### Requirement: Sort control rendered in Specs column header

The Specs column header SHALL render a sort control immediately to the left of the `+ Add` button. The control is composed of a mode chip and a direction arrow button.

#### Scenario: Control placement in header

- **WHEN** the Specs column is visible
- **THEN** the header renders, in left-to-right order: file icon, the text `Spec`, ticket count chip, label filter strip, sort control (mode chip + direction arrow), and the `+ Add` button
- **AND** the `+ Add` button remains right-aligned and fully visible at all viewport widths the column already supports

#### Scenario: Direction arrow hidden in Default mode

- **WHEN** the active sort mode is `Default`
- **THEN** only the mode chip is rendered, displaying the label `Default`
- **AND** the direction arrow button is not rendered

#### Scenario: Direction arrow visible in non-default modes

- **WHEN** the active sort mode is `Ticket #` or `Priority`
- **THEN** the mode chip displays the selected mode's label
- **AND** the direction arrow button is rendered next to the chip, showing `↑` for ascending and `↓` for descending

### Requirement: Three sort modes available from the mode chip

The mode chip SHALL open a menu offering exactly three options: `Default`, `Ticket #`, and `Priority`. Selecting an option activates that mode immediately for both the active specs section and the Done section.

#### Scenario: User selects Ticket # mode

- **WHEN** the user opens the mode chip menu and selects `Ticket #`
- **THEN** the mode chip label changes to `Ticket #`
- **AND** the direction arrow becomes visible using the user's last-known direction for the project (defaulting to `↓` descending on first use)
- **AND** the active specs list is reordered by ticket id in the current direction
- **AND** the Done specs list is reordered by ticket id in the current direction

#### Scenario: User selects Priority mode

- **WHEN** the user opens the mode chip menu and selects `Priority`
- **THEN** the mode chip label changes to `Priority`
- **AND** the direction arrow becomes visible (defaulting to `↓` descending on first use)
- **AND** both active and Done specs are reordered using priority buckets `critical > high > medium > low > null` with ticket `id` ascending as a stable tiebreaker (with the bucket comparison inverted when direction is ascending)

#### Scenario: User selects Default mode

- **WHEN** the user opens the mode chip menu and selects `Default`
- **THEN** the mode chip label changes to `Default`
- **AND** the direction arrow is hidden
- **AND** the active specs list returns to the user's custom drag-order persisted under `specrails-hub:spec-order:<projectId>`
- **AND** the Done specs list returns to its native order (no client-side reordering applied)

### Requirement: Direction toggle inverts current sorted order

The direction arrow SHALL toggle between ascending and descending for the current sort mode. The toggle is a no-op in `Default` mode (and the control is hidden there).

#### Scenario: Toggle from descending to ascending

- **WHEN** the mode is `Ticket #` or `Priority` with direction `↓`
- **AND** the user clicks the direction arrow
- **THEN** direction changes to `↑`
- **AND** the active and Done specs are re-rendered using the same comparator with the direction inverted

#### Scenario: Toggle from ascending to descending

- **WHEN** the mode is `Ticket #` or `Priority` with direction `↑`
- **AND** the user clicks the direction arrow
- **THEN** direction changes to `↓`
- **AND** lists re-render with descending direction applied

### Requirement: Priority sort uses fixed bucket order with stable tiebreaker

Priority sort SHALL group tickets into buckets `critical`, `high`, `medium`, `low`, and `null` (no priority assigned, e.g. drafts). Within a bucket, tickets SHALL be ordered by ticket `id` ascending, regardless of the overall direction. The bucket comparison SHALL be inverted when direction is ascending, placing the `null` bucket first.

#### Scenario: Descending priority places critical first, nulls last

- **WHEN** the mode is `Priority` and direction is `↓`
- **AND** the project has tickets with priorities `critical`, `high`, `medium`, `low`, and `null`
- **THEN** the list is ordered: all `critical` tickets, then all `high`, then `medium`, then `low`, then `null`
- **AND** within each bucket the tickets appear in ticket-id ascending order

#### Scenario: Ascending priority places nulls first, critical last

- **WHEN** the mode is `Priority` and direction is `↑`
- **THEN** the list is ordered: all `null` first, then `low`, then `medium`, then `high`, then `critical`
- **AND** within each bucket the tickets appear in ticket-id ascending order

### Requirement: Dragging a card while a non-default mode is active flips mode back to Default

When the user reorders cards via drag-and-drop while the active mode is `Ticket #` or `Priority`, the system SHALL set the mode to `Default`, persist the resulting visible order under `specrails-hub:spec-order:<projectId>`, and keep the dropped card at the position the user released it.

#### Scenario: Drag while in Priority mode flips to Default

- **WHEN** the mode is `Priority` with direction `↓` and the user drags a card to a new position within the active specs list and releases
- **THEN** the mode switches to `Default`
- **AND** the direction arrow becomes hidden
- **AND** the new order — exactly as the user sees it after the drop — is persisted as the project's custom drag-order
- **AND** the dropped card remains at the position the user released, with no visible jump

#### Scenario: Drag while in Ticket # mode flips to Default

- **WHEN** the mode is `Ticket #` and the user drags a card to a new position within the active specs list
- **THEN** the mode switches to `Default` and the new order is persisted as the custom drag-order

#### Scenario: Drag in Default mode preserves Default mode

- **WHEN** the mode is `Default` and the user drags a card to a new position
- **THEN** the mode remains `Default`
- **AND** the new order is persisted as the custom drag-order

### Requirement: Sort mode and direction persist per project

The active sort mode and direction SHALL be persisted in `localStorage` keyed by project id, so they survive reload and project switch. Direction is preserved while the mode is `Default` so the user's last sorted direction is restored when they return to `Ticket #` or `Priority`.

#### Scenario: Mode survives reload

- **WHEN** the user selects `Priority` with direction `↑` for project `<projectId>` and reloads the page
- **THEN** the Specs column for project `<projectId>` opens in `Priority` mode with direction `↑`

#### Scenario: Mode is independent per project

- **WHEN** project A is in `Ticket #` mode with `↓` and project B is in `Default`
- **AND** the user switches between A and B
- **THEN** each project keeps its own mode and direction

#### Scenario: Direction preserved across Default round-trips

- **WHEN** the user is in `Priority` with direction `↑`, switches to `Default`, then back to `Priority`
- **THEN** the direction returns to `↑` (not the on-first-use default of `↓`)

### Requirement: Sort applies identically to active and Done sections

The active sort mode and direction SHALL be applied to both the active specs list and the Done specs list rendered below the splitter, except that `Default` mode does not impose a client-side order on the Done section.

#### Scenario: Same mode applied to both sections

- **WHEN** the mode is `Priority` with direction `↓`
- **THEN** the Done section is also ordered by priority bucket with the same direction
- **AND** the splitter, drag affordances, and other layout elements behave identically to today

#### Scenario: Default mode does not reorder Done section

- **WHEN** the mode is `Default`
- **THEN** the Done section appears in its API-provided order (no client-side reordering)
