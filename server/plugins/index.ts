import type { Plugin } from '../types'
import { serenaPlugin } from './serena'

/**
 * Bundled plugins available to every project on this app build. Adding a new
 * plugin requires only:
 *   1. Implementing the `Plugin` interface under `server/plugins/<name>/`.
 *   2. Importing and appending it to this array.
 *
 * No other code in the app needs to change. PluginManager iterates this list
 * dynamically; conflicts (overlapping ownership) fail fast at startup.
 */
export const BUNDLED_PLUGINS: Plugin[] = [serenaPlugin]
