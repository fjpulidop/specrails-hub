import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from './db'
import { initHubDb } from './hub-db'
import {
  TERMINAL_DEFAULTS,
  TerminalSettingsValidationError,
  getHubTerminalSettings,
  patchHubTerminalSettings,
  getProjectOverride,
  patchProjectOverride,
  resolveTerminalSettings,
} from './terminal-settings'
import type { DbInstance } from './db'

describe('terminal-settings: hub layer', () => {
  let hubDb: DbInstance

  beforeEach(() => {
    hubDb = initHubDb(':memory:')
  })

  it('seeds documented defaults on first migration', () => {
    const settings = getHubTerminalSettings(hubDb)
    expect(settings).toEqual(TERMINAL_DEFAULTS)
  })

  it('PATCH upserts hub values and round-trips through the typed decoder', () => {
    const updated = patchHubTerminalSettings(hubDb, {
      fontSize: 14,
      renderMode: 'canvas',
      copyOnSelect: true,
      shellIntegrationEnabled: false,
      longCommandThresholdMs: 30_000,
    })
    expect(updated.fontSize).toBe(14)
    expect(updated.renderMode).toBe('canvas')
    expect(updated.copyOnSelect).toBe(true)
    expect(updated.shellIntegrationEnabled).toBe(false)
    expect(updated.longCommandThresholdMs).toBe(30_000)
    // Untouched fields remain at defaults.
    expect(updated.fontFamily).toBe(TERMINAL_DEFAULTS.fontFamily)
  })

  it('rejects out-of-range fontSize', () => {
    expect(() => patchHubTerminalSettings(hubDb, { fontSize: 4 })).toThrow(TerminalSettingsValidationError)
    expect(() => patchHubTerminalSettings(hubDb, { fontSize: 64 })).toThrow(TerminalSettingsValidationError)
    expect(() => patchHubTerminalSettings(hubDb, { fontSize: 14.5 })).toThrow(TerminalSettingsValidationError)
  })

  it('rejects unknown render mode', () => {
    expect(() => patchHubTerminalSettings(hubDb, { renderMode: 'metal' })).toThrow(TerminalSettingsValidationError)
  })

  it('rejects unknown setting key', () => {
    expect(() => patchHubTerminalSettings(hubDb, { fontWeight: 700 })).toThrow(TerminalSettingsValidationError)
  })

  it('rejects long-command threshold below 1000ms', () => {
    expect(() => patchHubTerminalSettings(hubDb, { longCommandThresholdMs: 500 })).toThrow(TerminalSettingsValidationError)
  })

  it('rejects boolean fields with non-boolean values', () => {
    expect(() => patchHubTerminalSettings(hubDb, { copyOnSelect: 'yes' })).toThrow(TerminalSettingsValidationError)
  })
})

describe('terminal-settings: project override layer', () => {
  let hubDb: DbInstance
  let projectDb: DbInstance

  beforeEach(() => {
    hubDb = initHubDb(':memory:')
    projectDb = initDb(':memory:')
  })

  it('returns empty override before any patch', () => {
    expect(getProjectOverride(projectDb)).toEqual({})
  })

  it('PATCH stores override and is observable via getProjectOverride', () => {
    patchProjectOverride(projectDb, { fontSize: 16, renderMode: 'webgl' })
    expect(getProjectOverride(projectDb)).toEqual({ fontSize: 16, renderMode: 'webgl' })
  })

  it('PATCH null clears that override key', () => {
    patchProjectOverride(projectDb, { fontSize: 16 })
    expect(getProjectOverride(projectDb)).toEqual({ fontSize: 16 })
    patchProjectOverride(projectDb, { fontSize: null })
    expect(getProjectOverride(projectDb)).toEqual({})
  })

  it('PATCH null does not require a value to currently exist', () => {
    expect(() => patchProjectOverride(projectDb, { fontSize: null })).not.toThrow()
    expect(getProjectOverride(projectDb)).toEqual({})
  })

  it('rejects out-of-range values in override layer too', () => {
    expect(() => patchProjectOverride(projectDb, { fontSize: 4 })).toThrow(TerminalSettingsValidationError)
  })
})

describe('terminal-settings: resolution', () => {
  let hubDb: DbInstance
  let projectDb: DbInstance

  beforeEach(() => {
    hubDb = initHubDb(':memory:')
    projectDb = initDb(':memory:')
  })

  it('returns hub defaults when no override exists', () => {
    expect(resolveTerminalSettings(hubDb, projectDb)).toEqual(TERMINAL_DEFAULTS)
  })

  it('project override wins per-field; absent fields fall back to hub', () => {
    patchHubTerminalSettings(hubDb, { fontSize: 14 })
    patchProjectOverride(projectDb, { renderMode: 'canvas' })
    const resolved = resolveTerminalSettings(hubDb, projectDb)
    expect(resolved.fontSize).toBe(14) // from hub
    expect(resolved.renderMode).toBe('canvas') // from override
    expect(resolved.fontFamily).toBe(TERMINAL_DEFAULTS.fontFamily) // built-in via hub seed
  })

  it('clearing an override falls back to hub for that field', () => {
    patchHubTerminalSettings(hubDb, { fontSize: 14 })
    patchProjectOverride(projectDb, { fontSize: 18 })
    expect(resolveTerminalSettings(hubDb, projectDb).fontSize).toBe(18)
    patchProjectOverride(projectDb, { fontSize: null })
    expect(resolveTerminalSettings(hubDb, projectDb).fontSize).toBe(14)
  })

  it('null projectDb returns hub layer only', () => {
    patchHubTerminalSettings(hubDb, { renderMode: 'webgl' })
    const resolved = resolveTerminalSettings(hubDb, null)
    expect(resolved.renderMode).toBe('webgl')
  })
})
