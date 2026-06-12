/**
 * Single source of truth for the specrails-core npm package spec the app
 * installs and probes (H5). Pinned to the current major range so a future
 * specrails-core 5.x with breaking changes never lands on every user the
 * minute it is published — adopting a new major is a deliberate one-line
 * bump here, shipped through the app's own release pipeline.
 *
 * `SPECRAILS_CORE_BIN` remains the escape hatch for local/linked builds
 * (see getCoreCommand in setup-manager.ts).
 */
export const CORE_PACKAGE_SPEC = 'specrails-core@^4.6.0'
