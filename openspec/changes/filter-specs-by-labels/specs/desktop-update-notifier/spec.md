## ADDED Requirements

### Requirement: Custom update toast renders without Sonner default chrome

The desktop update toast (mounted by `useDesktopUpdateNotifier`) SHALL render its custom card without Sonner's default toast wrapper styling. The `toast.custom` call MUST be invoked with `unstyled: true` so that no border, background, or padding is applied by Sonner around the custom card. No ghost outline, secondary border, or duplicated background SHALL be visible around the toast on any supported platform.

#### Scenario: toast.custom invoked with unstyled true

- **WHEN** the desktop update notifier surfaces an available update
- **THEN** the call to `toast.custom(...)` includes `unstyled: true` in its options object

#### Scenario: No double border on macOS

- **WHEN** the toast is rendered in the macOS Tauri build with the `dracula` theme
- **THEN** only the inner custom card's border (`border-accent-primary/35`) is visible and no outer rectangle, gradient, or padding from Sonner's default chrome surrounds it

### Requirement: Update toast lifecycle and persistence are unchanged

The update toast SHALL be mounted only when the runtime is Tauri (or the `VITE_MOCK_DESKTOP_UPDATE` mock flag is set), SHALL use the toast id `specrails-hub-desktop-update`, SHALL have `duration: Infinity`, SHALL be non-dismissible by Sonner's default UX (`dismissible: false`), and SHALL persist a "dismissed for this version" marker to `localStorage` under the key `specrails-hub:dismissedDesktopUpdateVersion` when the user clicks Dismiss.

#### Scenario: Toast suppressed for already-dismissed version

- **WHEN** the user previously dismissed update version `1.51.0` and the updater check returns the same version on next launch
- **THEN** no update toast is mounted

#### Scenario: Dismiss writes the version to localStorage

- **WHEN** the user clicks the Dismiss button on the update toast
- **THEN** `localStorage['specrails-hub:dismissedDesktopUpdateVersion']` equals the offered version and the toast is removed from the screen

### Requirement: Update toast surfaces install progress and ready state

The custom update card SHALL surface four user-visible states: `available` (with Update + Dismiss buttons enabled), `downloading` (Update button disabled, progress text and progress bar visible), `installing` (Update + Dismiss buttons disabled, status text "Verifying signature and installing..."), and `ready` (single Restart button replacing Update). Errors during download or install SHALL surface a description in place of the progress text and re-enable the Dismiss button.

#### Scenario: Buttons disable while installing

- **WHEN** the toast is in the `installing` state
- **THEN** both the Update button and the Dismiss button are disabled and visually muted

#### Scenario: Ready state replaces Update with Restart

- **WHEN** the install completes and the toast enters the `ready` state
- **THEN** the action button reads `Restart` and clicking it triggers `relaunch()` (or dismisses the toast in mock mode)
