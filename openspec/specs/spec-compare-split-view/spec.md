# spec-compare-split-view Specification

## Purpose

Provides a tablet/desktop split-view comparison surface for `TicketDetailModal`, enabling the user to view two spec tickets side-by-side via drag-to-snap or a "Comparar" toolbar action. The opposite half renders the dashboard's currently active view component as an embedded picker (ToDo tickets only, intersected with active dashboard filters), and selecting a picker card promotes it to a second independent modal. The feature is gated to viewports ≥900px wide and persists state via URL query parameters so refresh restores the comparison.

## Requirements

### Requirement: Drag-to-snap split entry
The system SHALL allow the user to enter split-view by dragging the active `TicketDetailModal` horizontally past 20% of the viewport width. Dragging left snaps the modal to the left half; dragging right snaps it to the right half. The opposite half SHALL show a picker rendering the dashboard's currently active view component.

#### Scenario: Drag left past threshold enters left-snap split
- **WHEN** the user opens a ticket modal and drags its header left past 20% of the viewport width
- **THEN** the modal snaps to occupy the left 50% of the viewport
- **AND** the right 50% renders the picker showing ToDo specs as cards

#### Scenario: Drag right past threshold enters right-snap split
- **WHEN** the user opens a ticket modal and drags its header right past 20% of the viewport width
- **THEN** the modal snaps to occupy the right 50% of the viewport
- **AND** the left 50% renders the picker showing ToDo specs as cards

#### Scenario: Drag cancelled below threshold returns to centered
- **WHEN** the user drags the modal header and releases before crossing the 20% threshold
- **THEN** the modal animates back to the centered modal position
- **AND** no picker is shown

### Requirement: Comparar toolbar trigger
The `TicketDetailModal` toolbar SHALL include a "Comparar" button that enters split-view without requiring a drag gesture.

#### Scenario: Comparar button enters right-snap split
- **WHEN** the user clicks the "Comparar" button in the modal toolbar
- **THEN** the modal animates to occupy the right 50% of the viewport
- **AND** the left 50% renders the picker

### Requirement: Picker uses the active dashboard view
The picker SHALL render using the same view component the user is currently viewing on the dashboard route (`SpecsBoard`, `TicketGridView`, `TicketListView`, or `TicketPostItView`), rendering exactly the same card components.

#### Scenario: Dashboard in grid view → picker in grid view
- **WHEN** the dashboard's active view is "grid" and the user enters split mode
- **THEN** the picker renders `TicketGridView` in picker mode

#### Scenario: Dashboard in postit view → picker in postit view
- **WHEN** the dashboard's active view is "postit" and the user enters split mode
- **THEN** the picker renders `TicketPostItView` in picker mode

### Requirement: Picker filters to ToDo and honours dashboard filters
The picker SHALL show only tickets with `status='todo'`, intersected with the dashboard's currently active filter chips and sort order, and SHALL exclude any ticket currently displayed in either side panel.

#### Scenario: Picker excludes already-open ticket
- **WHEN** the user enters split mode while viewing ticket A
- **THEN** the picker omits ticket A from its card list

#### Scenario: Picker respects dashboard label filter
- **WHEN** the dashboard has a label filter chip "frontend" active
- **AND** the user enters split mode
- **THEN** the picker shows only ToDo tickets with the "frontend" label

#### Scenario: Picker hides non-todo tickets
- **WHEN** any ticket has `status='draft'`, `'in-progress'`, `'done'`, or any status other than `'todo'`
- **THEN** that ticket SHALL NOT appear in the picker

### Requirement: Selecting a picker card mounts a second modal
Clicking a card in the picker SHALL replace the picker on that side with a full second `TicketDetailModal` instance for the selected ticket. Both panels remain independently interactive.

#### Scenario: Click card opens side B modal
- **WHEN** the user clicks a picker card for ticket B
- **THEN** the picker on that side is replaced by a `TicketDetailModal` showing ticket B
- **AND** side A continues to show the original ticket without disruption

### Requirement: Splitter is resizable from 50/50
The divider between the two panels SHALL start at a 50/50 split, support drag-to-resize, and clamp the ratio between 25% and 75%. The ratio SHALL be ephemeral and reset on close.

#### Scenario: Drag divider to resize
- **WHEN** the user drags the splitter divider toward one edge
- **THEN** the two panels resize proportionally to the pointer position
- **AND** neither panel becomes smaller than 25% of the viewport width

#### Scenario: Splitter resets on close
- **WHEN** the user resizes to 30/70 and then closes the comparison
- **AND** later re-opens a comparison
- **THEN** the new split starts at 50/50

### Requirement: Exit rules for split-view
Closing controls SHALL behave as follows:

#### Scenario: Backdrop click closes both panels
- **WHEN** the user clicks the modal backdrop outside both panels
- **THEN** both panels close and the dashboard becomes visible

#### Scenario: Close button on side A (origin) closes both
- **WHEN** the user clicks the `×` button on the panel that holds the originally-opened ticket
- **THEN** both panels close

#### Scenario: Close button on side B returns to picker
- **WHEN** the user clicks the `×` button on the secondary panel (side B)
- **THEN** side B is replaced by the picker
- **AND** side A continues to display its ticket

### Requirement: Intra-spec navigation to a third ticket exits split
When the user navigates from inside either panel to a ticket that is not currently displayed in the other panel (via Continue Explore, ticket mention, deep link, or any other intra-modal navigation), the system SHALL collapse split-view and open the third ticket in a single centered modal.

#### Scenario: Continue Explore on side A opens third ticket centered
- **WHEN** in split-view with tickets A (left) and B (right)
- **AND** the user clicks "Continue Explore" inside side A
- **THEN** split-view collapses
- **AND** a single centered modal opens for ticket A's draft origin

#### Scenario: Click ticket mention in side B opens third ticket centered
- **WHEN** in split-view with tickets A and B
- **AND** the user clicks a ticket-mention link to ticket C inside side B
- **THEN** split-view collapses
- **AND** a single centered modal opens for ticket C

### Requirement: URL persistence of split-view state
Split-view state SHALL be encoded in the current route's query parameters as `compare=<ticketId>` and `compareSide=left|right`. The state SHALL be restored on page refresh when the viewport is wide enough.

#### Scenario: Refresh restores split state
- **WHEN** the user is in split-view with ticket B on the right side and refreshes the page
- **THEN** the page reloads with split-view restored, ticket B visible on the right
- **AND** ticket A visible on the left

#### Scenario: Single-modal opens do not write query params
- **WHEN** the user opens a ticket modal without entering split mode
- **THEN** the URL contains no `compare` or `compareSide` parameter

#### Scenario: Closing split clears query params
- **WHEN** the user is in split-view and closes both panels
- **THEN** the `compare` and `compareSide` parameters are removed from the URL

#### Scenario: Unknown compare id is silently dropped
- **WHEN** the URL contains `?compare=<unknown-id>`
- **THEN** the parameter is cleared from the URL
- **AND** the user sees the dashboard with no error

### Requirement: Animated drag and snap
While dragging, the modal SHALL follow the pointer 1:1. When the drag crosses the 20% threshold or is released, the modal SHALL animate to its target position with a spring-style ease.

#### Scenario: Drag follows pointer 1:1
- **WHEN** the user moves the pointer N pixels horizontally during a drag
- **THEN** the modal moves N pixels horizontally

#### Scenario: Spring snap on threshold cross
- **WHEN** the drag crosses the 20% threshold
- **THEN** the modal snaps to the half-screen position with a spring animation

#### Scenario: Spring snap on release
- **WHEN** the user releases the pointer
- **THEN** the modal animates with a spring ease to either the snapped or centered position depending on threshold

### Requirement: Viewport gating below 900px
On viewports narrower than 900px, drag-to-snap and the "Comparar" button SHALL be disabled. If the viewport shrinks below 900px while in split-view, the system SHALL collapse to single-modal mode showing the origin-side ticket, preserving the URL parameter.

#### Scenario: Comparar button hidden on narrow viewport
- **WHEN** the viewport width is less than 900px
- **THEN** the "Comparar" button is not rendered

#### Scenario: Drag disabled on narrow viewport
- **WHEN** the viewport width is less than 900px
- **AND** the user attempts to drag the modal header
- **THEN** no split-view transition occurs

#### Scenario: Resize below threshold collapses split
- **WHEN** the user is in split-view and the viewport is resized below 900px
- **THEN** the system collapses to a single centered modal showing the origin-side ticket
- **AND** the `compare` URL parameter is preserved

### Requirement: Picker excludes drag-and-drop in embedded mode
When a dashboard view is rendered in picker mode, it SHALL disable its drag-and-drop interactions and SHALL hide its own page chrome (header bar, top-level filter strip).

#### Scenario: No DnD inside picker
- **WHEN** the user attempts to drag a card inside the picker
- **THEN** no drag preview or status change occurs

#### Scenario: No page chrome in picker
- **WHEN** the picker is rendered
- **THEN** the dashboard page header and top filter strip are not rendered inside the picker
