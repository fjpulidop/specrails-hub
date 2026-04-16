## Why

The current custom title bar uses Windows-style window control buttons on the right, which feels out of place on macOS. Replacing it with native traffic lights and a centered search pill gives the app a proper Mac-native feel while surfacing quick project search directly in the chrome.

## What Changes

- Enable `titleBarStyle: "Overlay"` in Tauri config so macOS renders native traffic light buttons
- Shrink title bar height to 28px (flush with traffic light circle height)
- Replace custom window control buttons with a centered search pill showing the active project name
- Clicking the search pill opens the existing Cmd+K command palette
- Windows/Linux behavior unchanged (decorations: false + custom buttons remain)

## Capabilities

### New Capabilities

- `mac-titlebar-search`: Compact macOS-native title bar with traffic lights and centered project search pill

### Modified Capabilities

- `desktop-titlebar`: Title bar rendering changes for macOS — Overlay title bar style, compact height, search pill replaces window control buttons

## Impact

- `src-tauri/tauri.conf.json` — add `titleBarStyle: "Overlay"` to window config
- `client/src/components/TitleBar.tsx` — macOS branch: drag region only + centered search pill; Windows/Linux: unchanged
- `client/src/components/CommandPalette.tsx` — no changes (existing Cmd+K handler reused)
- No new dependencies required (`useHub` context already available in TitleBar tree)
