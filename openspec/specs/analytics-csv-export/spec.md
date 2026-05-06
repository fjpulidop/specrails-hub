# analytics-csv-export Specification

## Purpose
TBD - created by archiving change project-spending-analytics. Update Purpose after archive.
## Requirements
### Requirement: CSV export uses blob download, not `window.open`

The `ExportDropdown` component SHALL trigger a CSV download via `fetch → Blob → URL.createObjectURL → anchor.click()` so that the file is saved to the user's Downloads folder in both Tauri and browser environments. The component SHALL NOT use `window.open` for any download path.

#### Scenario: Tauri webview download

- **WHEN** the user runs the app inside the Tauri desktop window and clicks "Export CSV"
- **THEN** the file is saved via the OS download manager
- **AND** no in-app webview tab is opened.

#### Scenario: Browser download

- **WHEN** the user runs the app in a browser and clicks "Export CSV"
- **THEN** the file is saved through the standard browser download flow
- **AND** no new tab is opened.

### Requirement: Two CSV flavours — Summary and Raw

The export dropdown SHALL offer four entries: `Summary CSV`, `Raw CSV`, `Summary JSON`, `Raw JSON`. The Summary export contains the data that drives the dashboard widgets; the Raw export contains one row per `ai_invocation`.

#### Scenario: Summary CSV layout

- **WHEN** the user downloads `Summary CSV`
- **THEN** the file contains the following section banners separated by a blank line: `# Totals`, `# Daily timeline`, `# By surface`, `# By model`, `# Top tickets`
- **AND** each section is followed by its own header row and data rows
- **AND** the file is valid UTF-8.

#### Scenario: Raw CSV layout

- **WHEN** the user downloads `Raw CSV`
- **THEN** the file's first row is the column header line containing all `ai_invocations` columns plus a `ticket_title` column
- **AND** subsequent rows are one invocation each, in `started_at DESC` order
- **AND** values containing commas, quotes, or newlines are quoted and escaped per RFC 4180.

### Requirement: Export respects the active filters

Both CSV and JSON exports SHALL honour the page-level filter state (`period`, `surface[]`, `ticketId`) at the moment the export is triggered.

#### Scenario: Page-level surface filter applies

- **WHEN** the user has the `surface=['explore-spec']` chip active and triggers Summary CSV
- **THEN** the file's `# By surface` section contains only the explore-spec line
- **AND** all aggregated totals reflect explore-spec rows only.

#### Scenario: Raw export carries secondary table filters

- **WHEN** the user has applied secondary table filters (`model`, `status`, `minCostUsd`) and triggers Raw CSV from the table-level export affordance
- **THEN** the file contains only rows that match the union of page-level and secondary filters.

### Requirement: Contextual filename

The server SHALL set `Content-Disposition: attachment; filename="..."` with a name composed from the project slug, the export kind, the period, an optional surface marker, and the current date.

#### Scenario: Summary filename

- **WHEN** project slug is `acme-shop`, period is `30d`, surface filter is "all", and date is 2026-05-06
- **THEN** the response sets filename `acme-shop-analytics-30d-2026-05-06.csv`.

#### Scenario: Raw filename with surface

- **WHEN** project slug is `acme-shop`, period is `7d`, surface filter is `['explore-spec']`, kind is raw, date is 2026-05-06
- **THEN** the response sets filename `acme-shop-invocations-7d-explore-2026-05-06.csv`.

### Requirement: Hard cap of 10 000 rows on Raw export with truncation marker

The Raw CSV/JSON export SHALL include at most 10 000 rows. When the underlying query would return more, the export SHALL be truncated to the most recent 10 000 by `started_at DESC` and a marker SHALL be appended.

#### Scenario: Truncation marker in CSV

- **WHEN** the active filter set matches 12 345 rows
- **THEN** the CSV file contains 10 000 data rows
- **AND** a final line `# truncated_at=10000 of 12345` is appended after the last data row.

#### Scenario: Truncation marker in JSON

- **WHEN** the active filter set matches more than 10 000 rows for a Raw JSON export
- **THEN** the response payload is `{ rows: [...10000 rows], truncated: true, totalAvailable: 12345 }`.

#### Scenario: Truncation hint in dropdown

- **WHEN** the dropdown is opened and the current filter would yield more than 10 000 rows
- **THEN** the Raw entries display a small hint "≤10k rows"
- **AND** the Summary entries are unaffected.

### Requirement: Empty-state and error handling

The export SHALL not produce a file containing only headers. The dropdown button SHALL be disabled when no data is available; failures SHALL be communicated via a toast.

#### Scenario: No data disables the button

- **WHEN** `getSpending` for the active filters returns `summary.totalRuns === 0`
- **THEN** the export button is rendered with `disabled` and a tooltip "No data for current filters"
- **AND** clicking it does nothing.

#### Scenario: Network error shows toast

- **WHEN** the export fetch rejects or returns a non-2xx status
- **THEN** a sonner `toast.error('Export failed')` is shown
- **AND** the button returns to its idle state
- **AND** no partial file is saved.

#### Scenario: Server-side direct hit returns headers-only

- **WHEN** an external `curl` call hits the export endpoint with filters that yield zero rows
- **THEN** the response is HTTP 200 with the headers-only CSV (no rows)
- **AND** `Content-Disposition` is still set with the contextual filename.

### Requirement: Removal of the legacy export

The previous `analytics.commandPerformance`-only CSV export SHALL be removed at the same time the redesigned page replaces the legacy `/analytics` view. There is no parallel old/new endpoint after the page rewrite ships.

#### Scenario: Legacy export endpoint behaviour

- **WHEN** a client requests `/analytics/export?format=csv` after this change ships
- **THEN** the response is the new Summary CSV (composite document)
- **AND** the response is NOT the legacy six-column commandPerformance dump.

