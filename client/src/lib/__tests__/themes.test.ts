import { describe, it, expect } from 'vitest'
import {
  THEMES,
  THEME_IDS,
  DEFAULT_THEME,
  THEME_LOCAL_STORAGE_KEY,
  isThemeId,
  getTheme,
  type ThemeId,
} from '../themes'

describe('themes', () => {
  describe('THEME_IDS allow-list', () => {
    it('contains the three documented built-in themes', () => {
      expect([...THEME_IDS]).toEqual(['dracula', 'aurora-light', 'obsidian-dark'])
    })

    it('THEMES has an entry for every ThemeId', () => {
      for (const id of THEME_IDS) {
        expect(THEMES).toHaveProperty(id)
      }
    })
  })

  describe('isThemeId', () => {
    it('accepts each known ThemeId', () => {
      for (const id of THEME_IDS) {
        expect(isThemeId(id)).toBe(true)
      }
    })

    it.each([
      ['unknown', 'unknown'],
      ['empty', ''],
      ['null', null],
      ['undefined', undefined],
      ['number', 42],
      ['object', {}],
    ])('rejects %s', (_label, value) => {
      expect(isThemeId(value)).toBe(false)
    })
  })

  describe('DEFAULT_THEME', () => {
    it('is dracula', () => {
      expect(DEFAULT_THEME).toBe('dracula')
    })

    it('is in the allow-list', () => {
      expect(isThemeId(DEFAULT_THEME)).toBe(true)
    })
  })

  describe('descriptors', () => {
    it.each(THEME_IDS as readonly ThemeId[])('descriptor %s has all required fields', (id) => {
      const t = THEMES[id]
      expect(t.id).toBe(id)
      expect(typeof t.displayName).toBe('string')
      expect(t.displayName.length).toBeGreaterThan(0)
      expect(typeof t.tagline).toBe('string')
      expect(t.tagline.length).toBeGreaterThan(0)
      expect(['light', 'dark']).toContain(t.scheme)
      expect(typeof t.previewSwatches.background).toBe('string')
      expect(typeof t.previewSwatches.foreground).toBe('string')
      expect(t.previewSwatches.accents).toHaveLength(4)
      expect(t.chart).toHaveLength(5)
      expect(t.status.completed).toBeDefined()
      expect(t.status.failed).toBeDefined()
      expect(t.status.canceled).toBeDefined()
      expect(t.status.running).toBeDefined()
      expect(t.status.queued).toBeDefined()
    })

    it.each(THEME_IDS as readonly ThemeId[])('xterm palette for %s defines all 16 ANSI + meta colors', (id) => {
      const xt = THEMES[id].xterm
      expect(xt.background).toBeDefined()
      expect(xt.foreground).toBeDefined()
      expect(xt.cursor).toBeDefined()
      expect(xt.selectionBackground).toBeDefined()
      const ansi = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const
      for (const c of ansi) {
        expect(xt[c]).toBeDefined()
        expect(xt[`bright${c.charAt(0).toUpperCase()}${c.slice(1)}` as keyof typeof xt]).toBeDefined()
      }
    })

    it('aurora-light has scheme=light, others=dark', () => {
      expect(THEMES['aurora-light'].scheme).toBe('light')
      expect(THEMES['dracula'].scheme).toBe('dark')
      expect(THEMES['obsidian-dark'].scheme).toBe('dark')
    })

    it('obsidian-dark background is distinct from dracula background', () => {
      expect(THEMES['obsidian-dark'].previewSwatches.background)
        .not.toBe(THEMES['dracula'].previewSwatches.background)
    })

    it('chart palette entries are unique within each theme', () => {
      for (const id of THEME_IDS) {
        const palette = THEMES[id].chart
        expect(new Set(palette).size).toBe(palette.length)
      }
    })
  })

  describe('getTheme', () => {
    it.each(THEME_IDS as readonly ThemeId[])('returns the descriptor for %s', (id) => {
      expect(getTheme(id)).toBe(THEMES[id])
    })
  })

  describe('THEME_LOCAL_STORAGE_KEY', () => {
    it('is namespaced and stable', () => {
      expect(THEME_LOCAL_STORAGE_KEY).toBe('specrails-hub:ui-theme')
    })
  })
})
