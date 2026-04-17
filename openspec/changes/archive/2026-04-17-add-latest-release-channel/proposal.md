## Why

specrails-web needs a stable URL to download the latest specrails-hub macOS build without hardcoding version numbers. Today the desktop-release workflow uploads `.dmg` files to a versioned folder (`/downloads/specrails-hub/v1.30.0/`) on Hostinger, which forces consumers to know the version ahead of time. A stable "latest" channel plus a machine-readable manifest lets the website render a live download button that always points at the newest build and surfaces the current version on the page.

## What Changes

- Desktop-release workflow SHALL also publish a copy of each released `.dmg` to `/downloads/specrails-hub/latest/` on Hostinger.
- Desktop-release workflow SHALL write a `manifest.json` into the same `latest/` folder describing the release (version, filename, sha256, size, released-at, release URL).
- The `.dmg` filename SHALL include the version so consumers can derive the version from the filename as a fallback when the manifest is unavailable.
- The versioned folder (`v<version>/`) SHALL continue to be published for archival and direct-link use.

## Capabilities

### New Capabilities
- `desktop-release-channel`: stable "latest" download URL for the specrails-hub macOS desktop build plus a machine-readable release manifest consumed by the marketing website.

### Modified Capabilities
_None. The existing `ci-cd` capability covers the npm publish side of the release pipeline and is not changed by this proposal._

## Impact

- **Code**: `.github/workflows/desktop-release.yml` gains a post-build step that uploads to `latest/` and writes `manifest.json`.
- **Infrastructure**: Hostinger FTP path `/downloads/specrails-hub/latest/` starts serving the most recent `.dmg` + a `manifest.json` file. The versioned path is unchanged.
- **Downstream**: specrails-web (separate repo) can read `manifest.json` to power a hero Download CTA. This change unblocks that work but does not require any web-side change to ship.
- **Security**: manifest includes sha256; consumers can verify integrity before install.
- **Breaking**: none. Additive — existing `v<version>/` URLs keep working.
