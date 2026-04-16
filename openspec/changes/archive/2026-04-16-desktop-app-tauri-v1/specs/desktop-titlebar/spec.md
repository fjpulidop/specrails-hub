## ADDED Requirements

### Requirement: Custom titlebar renders only inside the Tauri shell
The `TitleBar` component SHALL render only when `window.__TAURI_INTERNALS__` is defined. In browser or non-desktop contexts it SHALL render nothing, leaving the existing layout unaffected.

#### Scenario: Running inside Tauri
- **WHEN** the React app loads inside the Tauri WebView
- **THEN** a titlebar strip is rendered at the top of the window
- **AND** the titlebar contains the SpecRails SR icon, the app name "SpecRails Hub", and window control buttons (minimize, maximize, close)

#### Scenario: Running in a browser
- **WHEN** the React app loads in a regular browser
- **THEN** no titlebar is rendered
- **AND** the existing layout is unchanged

### Requirement: Titlebar drag region allows window movement
The titlebar SHALL include a drag region that enables the user to move the frameless window.

#### Scenario: User drags the titlebar
- **WHEN** the user clicks and drags the titlebar drag region
- **THEN** the app window moves following the cursor
- **AND** clicking on window control buttons does NOT trigger dragging

### Requirement: Window control buttons perform native window actions
The titlebar SHALL include minimize, maximize/restore, and close buttons using Tauri window APIs.

#### Scenario: Minimize button clicked
- **WHEN** the user clicks the minimize button
- **THEN** the window is minimized to the taskbar/dock

#### Scenario: Maximize button clicked
- **WHEN** the user clicks the maximize button and the window is not maximized
- **THEN** the window expands to fill the screen

#### Scenario: Restore button clicked
- **WHEN** the user clicks the maximize/restore button and the window is maximized
- **THEN** the window returns to its previous size and position

#### Scenario: Close button clicked
- **WHEN** the user clicks the close button
- **THEN** the window closes and the app exits (triggering sidecar shutdown)

### Requirement: Titlebar uses Dracula theme
The titlebar SHALL use the Dracula color palette: background `#282a36`, text/icon `#f8f8f2`, close button hover `#ff5555`, other controls hover `#44475a`.

#### Scenario: Visual appearance
- **WHEN** the titlebar is visible
- **THEN** the background color is `#282a36`
- **AND** the SR icon and "SpecRails Hub" label use color `#f8f8f2`
- **AND** hovering the close button turns it `#ff5555`
- **AND** hovering minimize/maximize buttons uses `#44475a`
