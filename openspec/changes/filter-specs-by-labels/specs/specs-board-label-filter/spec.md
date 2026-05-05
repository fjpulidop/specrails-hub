## ADDED Requirements

### Requirement: Inline label-pill filter row in Specs column header

The Specs column header SHALL render an inline label-pill filter row positioned between the `Spec [count]` group and the `+ Add` button, occupying the available horizontal space and shrinking to fit so that the existing Spec/Rails column proportions are preserved and the `+ Add` button remains pinned to the right.

#### Scenario: Pill row renders between count and Add button

- **WHEN** the active project has at least one ticket carrying a non-empty `labels[]`
- **THEN** the Specs column header renders, in left-to-right order: the file icon, the literal text `Spec`, the ticket count chip, the label-pill strip, and the `+ Add` button
- **AND** the `+ Add` button remains right-aligned and fully visible

#### Scenario: Pill row hidden when no labels exist

- **WHEN** no ticket in the active list carries any value in `labels[]`
- **THEN** the label-pill strip is not rendered at all (no empty container, no border artifacts)

### Requirement: Pills derived from active tickets and sorted by frequency

The label-pill strip SHALL aggregate labels from the active (non-Done) ticket list, computing a frequency count per label, and SHALL render one pill per distinct label sorted by count descending with alphabetical ascending tie-break.

#### Scenario: Most-used label appears first

- **WHEN** the active list contains tickets with labels `auth` (8 occurrences), `api` (5), `ui` (4)
- **THEN** the strip renders pills in the order `auth`, `api`, `ui` from left to right

#### Scenario: Alphabetical tie-break on equal counts

- **WHEN** two labels have identical counts (e.g. `api` (3) and `auth` (3))
- **THEN** the pill ordering places `api` before `auth`

#### Scenario: Done tickets do not contribute to pill aggregation

- **WHEN** a label appears only in Done tickets
- **THEN** that label does NOT appear as a pill in the strip

### Requirement: Theme-coherent coloring via deterministic hash to accent tokens

Each pill SHALL be colored using one of the six theme accent tokens (`accent-primary`, `accent-info`, `accent-success`, `accent-secondary`, `accent-warning`, `accent-highlight`), selected by a deterministic hash of the lowercased label such that the same label always resolves to the same accent token, independent of theme. Pills SHALL NOT use brand-named tokens (e.g. `dracula-*`) or hard-coded hex values.

#### Scenario: Same label always gets the same tone

- **WHEN** the strip renders the same label across multiple project switches or theme changes
- **THEN** the pill resolves to the same one of the six accent tokens every time

#### Scenario: Live theme switch updates pill colors

- **WHEN** the user changes the hub theme from `dracula` to `aurora-light`
- **THEN** every pill remains in the same accent-token bucket but its rendered color reflects the new theme's resolved value for that token

#### Scenario: No forbidden tokens used

- **WHEN** the rendered pill markup is inspected
- **THEN** no class name contains `dracula-` and no inline style contains a hex color literal

### Requirement: Multi-select OR filtering with toggle and clear

The strip SHALL support multi-select OR filtering. Clicking an inactive pill MUST add its label to the active filter set; clicking an active pill MUST remove its label. The active list and the Done section SHALL both render only those tickets whose `labels[]` intersects the active filter set whenever the active set is non-empty. An empty active set SHALL apply no filter.

#### Scenario: Toggling pills filters both active and Done sections

- **WHEN** the user clicks the `auth` pill
- **THEN** the pill enters the active state and the active list and Done section render only tickets with `auth` in their labels

#### Scenario: Multi-select uses OR semantics

- **WHEN** the user clicks `auth` and then `api` so both pills are active
- **THEN** the rendered tickets are those with `auth` OR `api` (or both) in their labels

#### Scenario: Clicking an active pill removes it from the filter

- **WHEN** the `auth` pill is active and the user clicks it again
- **THEN** the pill returns to the inactive state and `auth`-only tickets are no longer required

#### Scenario: Empty active set shows everything

- **WHEN** the user removes the last active label from the filter set
- **THEN** the active list and Done section render their full unfiltered contents

### Requirement: Clear chip and filtered count reflect active set

When the active filter set is non-empty, the strip SHALL render a leading clear chip displaying `× N · clear` where N is the size of the active set, and the Spec count chip SHALL display `[filtered/total]` instead of `[total]`. Clicking the clear chip MUST empty the active filter set.

#### Scenario: Count flips when filter active

- **WHEN** the active list has 12 tickets and the filter narrows the visible active list to 4
- **THEN** the count chip in the header reads `4/12`

#### Scenario: Clear chip resets the filter

- **WHEN** the user clicks the leading `× N · clear` chip
- **THEN** the active filter set becomes empty, the clear chip disappears, and the count chip returns to `[total]`

### Requirement: Pill count format and visual weight

Each pill SHALL display the label text followed by a middle-dot and the frequency count (e.g. `auth ·8`), with the count rendered at reduced opacity so the label is the dominant glyph. Pill height SHALL be `h-5` and font size `text-[10px]`.

#### Scenario: Pill renders label and count

- **WHEN** the `auth` label appears 8 times in the active list
- **THEN** the pill text is `auth ·8` (label, narrow space, middle-dot, count)

### Requirement: Horizontal scroll with edge fade and wheel translation

When the pill row's intrinsic width exceeds the available horizontal space, the strip SHALL scroll horizontally without exposing a visible scrollbar, SHALL render an edge-fade mask on the left and right edges to indicate scrollable content, and SHALL translate vertical wheel events into horizontal scroll while the cursor is over the strip. No left/right chevron buttons SHALL be rendered.

#### Scenario: Strip scrolls horizontally on overflow

- **WHEN** the pill row's content width exceeds the strip's viewport width
- **THEN** the strip scrolls horizontally on user interaction (touch drag, trackpad, wheel) and the native scrollbar is hidden

#### Scenario: Vertical wheel translates to horizontal scroll over strip

- **WHEN** the user scrolls the mouse wheel vertically while the cursor is over the strip and horizontal scroll is possible in that direction
- **THEN** the strip scrolls horizontally and the page does not scroll vertically

#### Scenario: Wheel events at scroll edges propagate to page

- **WHEN** the user scrolls vertically while the strip is already at the relevant horizontal edge
- **THEN** the wheel event is not preventDefaulted and page vertical scrolling proceeds normally

### Requirement: Filter state is in-memory and per-project

The active filter set SHALL be stored in component state local to the Specs board, SHALL NOT be persisted to `localStorage` or `sessionStorage`, and SHALL be reset to empty whenever the active project changes.

#### Scenario: Reload clears the filter

- **WHEN** the user applies a filter and then reloads the page
- **THEN** the active filter set is empty after reload

#### Scenario: Project switch clears the filter

- **WHEN** the user has applied a filter in project A and switches to project B
- **THEN** project B opens with an empty filter set
