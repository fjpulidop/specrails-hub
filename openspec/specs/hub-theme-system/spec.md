# hub-theme-system Specification

## Purpose
TBD - created by archiving change add-hub-theme-system. Update Purpose after archive.
## Requirements
### Requirement: Hub-wide theme catalog

The hub SHALL ship with exactly three built-in themes selectable by the user: `dracula` (default), `aurora-light`, and `obsidian-dark`. Each theme MUST define a complete palette covering background, foreground, surfaces, semantic accents (primary, secondary, info, success, warning, danger, highlight), borders, and muted variants. Theme identifiers MUST be kebab-case strings drawn from a closed allow-list enforced on both client and server.

#### Scenario: Default theme is Dracula on a fresh install
- **WHEN** the hub is launched for the first time and no `ui_theme` row exists in `hub_settings`
- **THEN** the active theme is `dracula` and the database is seeded with `ui_theme = 'dracula'`

#### Scenario: Unknown theme identifier is rejected
- **WHEN** the client or an external caller attempts to PATCH the theme to a value outside the allow-list
- **THEN** the server responds with HTTP 400 and the persisted value is unchanged

#### Scenario: Aurora Light preserves brand identity
- **WHEN** the active theme is `aurora-light`
- **THEN** the primary accent remains a purple/indigo hue (preserving brand recognition) while the background is a warm or neutral off-white (not pure `#ffffff`) and all text/background pairs meet WCAG AA contrast for body copy

#### Scenario: Obsidian Dark is visually distinct from Dracula
- **WHEN** the active theme is `obsidian-dark`
- **THEN** the background is a near-black blue-tinted hue distinct from Dracula's purple-tinted dark surface, and the accent palette is differentiated enough that a user can tell the two themes apart side-by-side

### Requirement: Semantic CSS-variable token system

All client component code SHALL reference colors exclusively through semantic Tailwind tokens (e.g. `accent-primary`, `accent-success`, `surface`, `background-deep`). Brand-named tokens (`dracula-*`) MUST NOT appear in any source file under `client/src/` after this change ships. Adding a new theme MUST require zero changes to component code.

#### Scenario: No brand-named tokens leak into components
- **WHEN** a regression check runs `grep -rn "dracula-" client/src --include="*.ts" --include="*.tsx" --include="*.css"`
- **THEN** the command returns zero matches

#### Scenario: Adding a fourth theme touches only theme files
- **WHEN** a developer adds a hypothetical `solarized-dawn` theme by appending one entry to the theme registry, one CSS override block, and one xterm/chart palette
- **THEN** the theme is selectable in Settings and renders correctly without modifying any component file

### Requirement: Theme persistence in hub settings

The active theme SHALL be persisted in the `hub_settings` table under the key `ui_theme`. The server SHALL expose endpoints to read and update this value. The persisted value SHALL survive server restarts and be the authoritative source in cross-device usage.

#### Scenario: GET returns the persisted theme
- **WHEN** a client issues `GET /api/hub/theme`
- **THEN** the server responds with `{ "theme": "<persisted-value>" }` and HTTP 200

#### Scenario: PATCH updates the persisted theme
- **WHEN** a client issues `PATCH /api/hub/theme` with body `{ "theme": "obsidian-dark" }`
- **THEN** the server persists the value to `hub_settings`, responds with HTTP 200 and the new value, and a subsequent GET returns the same value

#### Scenario: Theme survives server restart
- **WHEN** the user sets theme to `aurora-light` and the server is restarted
- **THEN** on the next boot the persisted theme remains `aurora-light` and is returned by `GET /api/hub/theme`

### Requirement: Theme switching is instantaneous and re-render-free

Theme switches SHALL be applied by mutating `data-theme` on the document root element. The CSS-variable resolution mechanism MUST update all themed surfaces in a single repaint without remounting React subtrees, recreating xterm instances, or re-issuing chart computations beyond a single palette refresh.

#### Scenario: Switching theme does not unmount terminals
- **WHEN** the user switches theme while a terminal session is open with active scrollback
- **THEN** the terminal scrollback, command marks, and shell-integration state are preserved, and the terminal instance is the same JavaScript object before and after the switch

#### Scenario: Switching theme repaints CSS in one frame
- **WHEN** the theme is changed
- **THEN** within the next paint frame all CSS-var-driven surfaces (cards, text, borders, backgrounds) reflect the new theme, with no visible flash of an intermediate state

### Requirement: No flash of wrong theme on hub boot

On every hub page load, the document root SHALL have its `data-theme` attribute set to the user's chosen theme before the React application hydrates. The chosen theme value SHALL be cached in `localStorage` under a documented key whenever the server-side value changes.

#### Scenario: Returning user sees their theme on first paint
- **WHEN** a user with `ui_theme = 'aurora-light'` loads the hub UI
- **THEN** the very first painted frame shows Aurora Light styling, with no Dracula flash

#### Scenario: localStorage cache mirrors server value
- **WHEN** the user changes theme via Settings
- **THEN** `localStorage.getItem('specrails-hub:ui-theme')` returns the new theme identifier before the next page reload

#### Scenario: Corrupt localStorage value falls back to default
- **WHEN** `localStorage` contains a value not in the theme allow-list (or throws on access)
- **THEN** the boot script applies `dracula` and the application proceeds without error

#### Scenario: Server value wins over stale cache
- **WHEN** the cached localStorage value differs from the server-persisted value (e.g. user changed theme on another machine)
- **THEN** after the React app fetches the server value it updates `data-theme` and overwrites the localStorage cache

### Requirement: Theme propagates to non-CSS rendering surfaces

The active theme SHALL be applied consistently to surfaces that render outside the CSS-variable cascade: xterm.js terminals, Recharts analytics charts, the LogViewer syntax highlighting, and the demo-mode tour overlay.

#### Scenario: Terminal palette matches active theme
- **WHEN** the active theme changes
- **THEN** every open xterm session updates its background, foreground, cursor, and ANSI 16 palette to the new theme's terminal palette without losing scrollback or shell-integration marks

#### Scenario: Charts repaint in the new palette
- **WHEN** the active theme changes while an analytics page is mounted
- **THEN** all Recharts series, axes, gridlines, and tooltips repaint using the new theme's chart palette

#### Scenario: Log syntax highlighting follows theme
- **WHEN** the active theme is `aurora-light` and a log file is rendered in `LogViewer`
- **THEN** keyword, string, comment, and error tokens use the light-theme syntax palette and remain legible against the light background

#### Scenario: Demo tour overlay matches theme
- **WHEN** the user starts the demo tour under any active theme
- **THEN** the tour overlay backdrop, callout cards, and highlight rings render in colors consistent with the active theme

### Requirement: Appearance section in hub global settings

The `GlobalSettingsPage` modal SHALL expose an "Appearance" section that lists the three built-in themes as selectable, visually rich preview cards. The currently active theme MUST be visually marked. Selecting a card MUST persist the choice and apply the theme immediately. The section MUST NOT offer hover-based live preview in v1.

#### Scenario: All three themes are listed
- **WHEN** the user opens the hub Settings modal and navigates to Appearance
- **THEN** exactly three cards are visible, one per built-in theme, each showing a swatch preview, the theme name, and a short tagline

#### Scenario: Active theme is marked
- **WHEN** the user opens the Appearance section
- **THEN** the card corresponding to the persisted `ui_theme` value is visually marked as selected (e.g. ring, check icon, or filled state)

#### Scenario: Selecting a card applies and persists the theme
- **WHEN** the user clicks a non-active theme card
- **THEN** within the same frame the document root's `data-theme` is updated, the server `PATCH /api/hub/theme` is called with the new value, the localStorage cache is updated, and the card becomes the marked selection

#### Scenario: Server failure surfaces an error and reverts UI
- **WHEN** the user selects a theme and the server PATCH fails (network error or rejection)
- **THEN** the UI reverts the visual selection to the previously active theme and displays a recoverable error message

### Requirement: Theme system is hub-wide only

The active theme SHALL apply uniformly across all projects within a single hub instance. Projects MUST NOT be able to override the theme. Switching the active project MUST NOT change the theme.

#### Scenario: Theme persists across project switches
- **WHEN** the user sets theme to `obsidian-dark` and then switches between projects in the hub
- **THEN** every project's UI renders under `obsidian-dark` and no theme change occurs during the project switch

