## ADDED Requirements

### Requirement: `/analytics` route renders the project spending dashboard

The system SHALL render the project spending dashboard at the existing `/analytics` route under `ProjectLayout`. The route name and the right-sidebar entry label "Analytics" remain unchanged. The page SHALL contain seven blocks in the order: Hero, Daily Timeline, Quick-vs-Explore card, Model Breakdown, Cost-vs-Turns Scatter, Top Tickets cross-surface, Raw filterable Invocations table.

#### Scenario: Page mounts at `/analytics`

- **WHEN** the user navigates to `/analytics` for an active project
- **THEN** the page renders the seven blocks in order
- **AND** there is no other top-level route or page providing project spending visualisation.

### Requirement: Single header filter set drives the whole page

The page SHALL expose one filter bar at the top with `period` selector (`7d`/`30d`/`90d`/`all`/custom range) and a multi-select `surface` chip group (`all`, `jobs`, `explore`, `quick`, `refine`). Changing any of these filters SHALL refetch and re-render every block on the page in a coordinated manner.

#### Scenario: Period change rerenders all blocks

- **WHEN** the user changes the period from 30d to 7d
- **THEN** the Hero, Timeline, Quick-vs-Explore, Model Breakdown, Scatter, Top Tickets, and Raw Table all reflect the new period
- **AND** there is exactly one network round-trip for the bulk widgets (`getSpending`) plus one for the table.

#### Scenario: Surface chip toggles narrow the view

- **WHEN** the user toggles off the `jobs` chip
- **THEN** every block excludes job rows from totals, breakdowns, and the table
- **AND** the chip group state is reflected in the URL query string so the view is shareable.

### Requirement: Hero burn meter shows total cost, prev-period delta, and stacked surface breakdown

The Hero block SHALL display: the total cost USD for the active filter window in a large tabular-numerals figure, a `vs prev period` percentage delta with up/down arrow, the total invocation count, and a horizontal stacked bar showing the per-surface decomposition with surface labels and absolute amounts.

#### Scenario: Empty state

- **WHEN** the active filters yield zero rows
- **THEN** the Hero shows `$0.00`, `0 invocations`, no delta, and an empty bar with a message "Tracking started <YYYY-MM-DD>" referencing the timestamp of the project's first invocation row (or the database creation date if none exist yet).

#### Scenario: Delta sign and colour

- **WHEN** the current period total exceeds the previous period total
- **THEN** the delta is rendered with `+N% ▲` styled with the warning accent token
- **AND** when current is lower the delta is rendered with `−N% ▼` styled with the success accent token.

### Requirement: Daily Timeline stacked by surface

The Timeline block SHALL render a per-day stacked bar (or area) chart using Recharts with one stack segment per surface, covering every day in the active period (zero-filled).

#### Scenario: Hover tooltip shows breakdown

- **WHEN** the user hovers a day's bar
- **THEN** a tooltip displays the date, the per-surface absolute amount, and the day's total.

### Requirement: Quick-vs-Explore comparison card

The Quick-vs-Explore block SHALL render a side-by-side card for spec-creating surfaces only (`quick-spec` and `explore-spec`), showing for each: count of specs created, average cost per spec, average duration (claude-active for explore, wallclock for quick), the dominant model, and an inline sparkline. The card SHALL also show the cost ratio between the two as a single explicit number (e.g. "8.9× more per spec").

#### Scenario: Sparse-data fallback

- **WHEN** the Explore side has fewer than 5 spec rows in the active period
- **THEN** the Explore card renders a CTA "Try Explore for richer specs" instead of stale numbers
- **AND** the cost-ratio line is hidden.

#### Scenario: Spec count counts only ticket-creating runs

- **WHEN** a Quick or Explore invocation has `status='success'` but `ticket_id IS NULL`
- **THEN** it does NOT count toward "specs created"
- **AND** it DOES count toward `totalRuns` shown in the Hero.

### Requirement: Model Breakdown horizontal bar

The Model Breakdown block SHALL render a horizontal bar list of the top N models (default 5) by total cost in the active filter window, with each bar showing the model name, total cost, and a relative-width bar.

#### Scenario: Click filters the page

- **WHEN** the user clicks a model bar
- **THEN** the page filter state adds the chosen model to its `model` filter, refetching all blocks and the table.

### Requirement: Cost-vs-Turns scatter for outlier discovery

The Scatter block SHALL render every invocation in the active filter window as a point with x-axis `num_turns` (or `duration_ms` when `num_turns` is null), y-axis `total_cost_usd`, colour-coded by surface.

#### Scenario: Outlier hover

- **WHEN** the user hovers a point
- **THEN** a tooltip displays the surface icon, the resolved ticket title (if any) or `(unattributed)`, the cost, the turn count, and the started-at timestamp.

#### Scenario: Click drills into the row

- **WHEN** the user clicks a point
- **THEN** the page scrolls to the Raw Table block, the table filters seed to that row's surface and ticket, and the row is highlighted.

### Requirement: Top Tickets cross-surface

The Top Tickets block SHALL render the top 10 tickets by aggregate cost across all surfaces in the active filter window, each row showing the ticket id, title, total cost, and a per-surface mini-breakdown (e.g. `2 jobs + 1 explore + 3 refine`).

#### Scenario: Deleted ticket is rendered dimly

- **WHEN** an `ai_invocations` row's `ticket_id` does not match any ticket in `tickets.yaml`
- **THEN** its contribution is grouped under a row labeled "deleted ticket #N" rendered with reduced opacity, mirroring the convention used in `JobTicketHeader`.

#### Scenario: Unattributed bucket

- **WHEN** rows with `ticket_id IS NULL` (e.g. abandoned Explore conversations) contribute non-zero cost in the period
- **THEN** the list includes a synthetic top entry "Unattributed" with the aggregated cost, only if its total would place it within the top 10.

### Requirement: Raw filterable Invocations table

The Raw Table block SHALL render a paginated table of `ai_invocations` rows for the active filter window, with columns: `#` (row id), Surface (icon), Ticket (link), Cost, Turns, Tokens, Model, Status, Started. The block SHALL provide secondary filters that scope only this block: `model`, `status`, `minCostUsd`.

#### Scenario: Secondary filters do not affect other blocks

- **WHEN** the user applies a secondary `minCostUsd ≥ 1.00` filter
- **THEN** only the Raw Table re-queries; the Hero, Timeline, and other blocks remain on the page-level filters
- **AND** the Export menu reflects the table-level filter set when triggered while the table is in the user's focus context (see analytics-csv-export spec).

#### Scenario: Row click opens drawer

- **WHEN** the user clicks a row
- **THEN** a side drawer opens showing, for `surface='explore-spec'`, a per-turn timeline with cost per turn, and for other surfaces the spawned command line (redacted of secrets) and the parsed `result` event payload.

### Requirement: Deep link from `TicketDetailModal`

`TicketDetailModal` SHALL render a single concise summary line under the ticket title showing the ticket's aggregate cost, total turns, claude-active duration, and a per-surface mini-breakdown, with a trailing affordance that links to `/analytics?ticketId=<id>`.

#### Scenario: Link seeds the page filters

- **WHEN** the user clicks the affordance
- **THEN** the route changes to `/analytics?ticketId=<id>`
- **AND** the page mounts with `ticketId` pre-applied as a filter
- **AND** the surface chip group resets to `all` so the user sees every surface that touched this ticket.

#### Scenario: Ticket with no invocations

- **WHEN** the ticket has zero `ai_invocations` rows
- **THEN** the summary line is not rendered
- **AND** no link is shown.

### Requirement: Live invalidation refreshes the page

The page SHALL listen for `spending.invalidated` WebSocket messages scoped to the active project and refetch the spending data when one arrives. The refresh SHALL be debounced (≥500 ms) so a burst of invocations does not cause a refetch storm.

#### Scenario: Open page during a job batch

- **WHEN** the user is on `/analytics` and three job-completed events fire within one second
- **THEN** the dashboard refetches at most once after a 500 ms debounce window expires
- **AND** the data displayed is consistent with the latest writes.

### Requirement: Loading and skeleton states

The page SHALL render a skeleton placeholder for each block on initial load that matches the final layout dimensions, so the content does not visually reflow when data arrives.

#### Scenario: Skeleton respects layout

- **WHEN** the page is loading data for the first time
- **THEN** each block renders a skeleton with the same outer height and width as its loaded state
- **AND** when data arrives the block fades in without any layout shift exceeding 4 px on either axis.
