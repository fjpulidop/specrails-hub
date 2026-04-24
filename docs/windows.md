# SpecRails Hub on Windows

## Supported configurations

- **Windows 10** (1809 or newer, for ConPTY terminal support) and **Windows 11**, x64
- ARM64 Windows is not yet supported

## Installation

Two installer formats are published under `downloads/specrails-hub/latest/` on every release:

- `specrails-hub-<version>-x64-setup.exe` — NSIS installer (recommended for individual users)
- `specrails-hub-<version>-x64.msi` — MSI installer (for enterprise group-policy deployment)

Versioned copies live at `downloads/specrails-hub/v<version>/` for archival and deep-linking.

## SmartScreen warning

The current Windows installers are **not code-signed**. Running them triggers Microsoft SmartScreen:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.

To install:

1. Click **More info**
2. Click **Run anyway**

This warning is expected and will persist until Authenticode code signing is added in a later release. The installer and the bundled server binary are built by GitHub Actions from source and their sha256 hashes are published in `manifest.json`; verify before running if you want higher assurance:

```powershell
Get-FileHash specrails-hub-<version>-x64-setup.exe -Algorithm SHA256
```

Compare the output against `platforms["windows-x64"].sha256` in `manifest.json` at `https://specrails.dev/downloads/specrails-hub/latest/manifest.json`.

## Uninstall

- NSIS: use the **Start Menu → SpecRails Hub → Uninstall** entry, or *Settings → Apps*.
- MSI: use *Settings → Apps* or `msiexec /x <msi-path>`.

## Known limitations

- **Terminal panel**: on Windows, the bottom terminal panel spawns `powershell.exe -NoLogo`. If you prefer `cmd` or `pwsh.exe`, configure the system default shell via environment — per-session shell selection is not yet exposed in the UI.
- **Port 4200** must be free on launch. If another process holds it, the app will exit with a native error dialog.
- **Custom window chrome**: the app uses a frameless window with a custom titlebar. The Windows min/max/close controls are rendered by the hub; snap-layouts on Windows 11 may not be fully wired yet.
