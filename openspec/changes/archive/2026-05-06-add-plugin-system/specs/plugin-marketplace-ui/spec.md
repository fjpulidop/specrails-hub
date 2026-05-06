## ADDED Requirements

### Requirement: Integrations route per project
The client SHALL expose an `IntegrationsPage` at the project-scoped route `/integrations`, mounted under `ProjectLayout`, reachable from a sidebar entry placed adjacent to the existing Agents entry.

#### Scenario: Sidebar entry navigates to integrations
- **WHEN** a project is active and the user clicks the sidebar "Integrations" item
- **THEN** the router navigates to `/integrations` and `IntegrationsPage` mounts within `ProjectLayout`

#### Scenario: Page is per-project
- **WHEN** the user switches the active project on `IntegrationsPage`
- **THEN** the page refetches the catalog using `getApiBase()` and re-renders cards reflecting the new project's plugin state without flashing an empty state when cached data exists

### Requirement: Marketplace card per plugin
Every plugin in the catalog MUST be rendered as a card showing: icon, name, version, description, `whatItDoes` bullets, prerequisite list with live satisfied/missing badges, and a primary action that depends on status.

#### Scenario: Card shows Install when plugin not installed
- **WHEN** the catalog reports `status: "not-installed"` for plugin Serena
- **THEN** the card's primary action is `Install` and no uninstall control is rendered

#### Scenario: Card shows Active + Uninstall when installed
- **WHEN** the catalog reports `status: "installed"` for plugin Serena with healthy verify
- **THEN** the card displays an `Active` badge and an `Uninstall` button

#### Scenario: Card shows degraded badge when verify fails
- **WHEN** the catalog reports `status: "degraded"` (installed but verify failed) for a plugin
- **THEN** the card displays a degraded badge with a "Diagnose" affordance that opens the verify reason

### Requirement: Install dialog with diff preview
Clicking `Install` MUST open a modal that calls `GET /api/projects/:id/plugins/:name/preview-install` and renders the returned diff before the user confirms. The dialog MUST display: a summary of what the plugin does, the list of files about to be created or modified with create (`+`) / modify (`~`) markers, and a prerequisite section reusing the existing `PrerequisitesPanel` pattern.

#### Scenario: Preview is rendered before any mutation
- **WHEN** the user clicks Install on a plugin card
- **THEN** the dialog opens, the preview-install endpoint is called once, and no project files are mutated until the user confirms

#### Scenario: Prerequisites missing disables confirm
- **WHEN** the dialog opens and a required prerequisite (e.g. `uv`) is missing
- **THEN** the confirm button is disabled and an "Auto-install" affordance is rendered for the missing prerequisite

#### Scenario: Confirm starts install and streams progress
- **WHEN** the user clicks the confirm button
- **THEN** `POST /api/projects/:id/plugins/:name/install` is called, install progress is shown in a streaming log inside the dialog (driven by the project WebSocket), and on success the dialog auto-closes after 1500ms

### Requirement: Uninstall dialog with destructive confirm
Clicking `Uninstall` MUST open a destructive-style modal that lists every file the plugin will revert or remove, plus a "Will NOT touch" section enumerating what stays (binary tools installed on the system, user code, tickets, history). The modal's primary button MUST be styled as destructive and MUST require an explicit click to proceed; no "click outside to confirm" shortcut.

#### Scenario: Cancel leaves state untouched
- **WHEN** the user opens the uninstall dialog and clicks Cancel
- **THEN** no API call is issued and the plugin remains installed

#### Scenario: Confirm uninstalls and re-renders card
- **WHEN** the user clicks the destructive confirm button
- **THEN** `DELETE /api/projects/:id/plugins/:name` is called, the dialog closes on success, and the card re-renders in `not-installed` state

### Requirement: WebSocket-driven status updates
`IntegrationsPage` MUST subscribe to the project event stream and update card state in response to `plugin.installed`, `plugin.uninstalled`, `plugin.degraded`, and `plugin.health_changed` events whose `projectId` matches the active project. Events for other projects MUST be ignored.

#### Scenario: plugin.degraded badge appears live
- **GIVEN** the page is open and Serena is installed and active
- **WHEN** the server emits `plugin.degraded` for `projectId` matching the active project
- **THEN** the Serena card switches to the degraded visual state without a manual refresh

#### Scenario: Events for inactive projects are ignored
- **GIVEN** the page is open for project A
- **WHEN** the server emits `plugin.installed` with `projectId = B`
- **THEN** no card on the page updates

### Requirement: Orphan plugin presentation
Cards whose status is `orphan` MUST be rendered in a clearly separated section with a deprecation banner and a destructive "Remove orphan" action that calls `DELETE /api/projects/:id/plugins/:name`. Orphan cards MUST NOT be eligible for install or healthcheck actions.

#### Scenario: Orphan section appears below catalog
- **WHEN** the catalog response contains entries with `status: "orphan"`
- **THEN** they render under a "Deprecated" subheader, after the active catalog, with only a Remove action

### Requirement: Empty and error states
The page MUST handle three non-happy states with explicit copy: (1) catalog fetch in flight (skeleton cards), (2) catalog fetch failed (error state with Retry), (3) catalog empty (calm copy explaining no plugins are bundled in this hub build).

#### Scenario: Fetch failure shows retry
- **WHEN** the catalog endpoint returns 5xx
- **THEN** the page shows an error card with a Retry button that re-fetches when clicked

### Requirement: Stale-while-revalidate caching across project switch
`IntegrationsPage` MUST use the existing `useProjectCache` pattern so switching back to a previously-viewed project shows cached cards instantly while a fresh fetch updates them in the background. The page MUST never reset to an empty state on project switch when cached data exists.

#### Scenario: Cached cards survive project switch
- **GIVEN** the user has visited Integrations for project A and the catalog is cached
- **WHEN** the user switches to project B and back to A
- **THEN** A's cards render immediately from cache while a background fetch revalidates them
