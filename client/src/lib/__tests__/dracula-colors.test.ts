import { describe, it, expect } from 'vitest'
import { DRACULA, STATUS_COLORS, CHART_PALETTE } from '../dracula-colors'

describe('dracula-colors', () => {
  // ── DRACULA palette ──────────────────────────────────────────────────────────

  describe('DRACULA', () => {
    const expectedKeys = ['purple', 'cyan', 'green', 'pink', 'orange', 'red', 'yellow', 'comment']

    it('exports exactly 8 named colors', () => {
      expect(Object.keys(DRACULA)).toHaveLength(8)
    })

    it('contains all expected color names', () => {
      for (const key of expectedKeys) {
        expect(DRACULA).toHaveProperty(key)
      }
    })

    it('all color values are HSL strings', () => {
      for (const value of Object.values(DRACULA)) {
        expect(value).toMatch(/^hsl\(\d+\s+\d+%\s+\d+%\)$/)
      }
    })

    it('purple is hsl(265 89% 78%)', () => {
      expect(DRACULA.purple).toBe('hsl(265 89% 78%)')
    })

    it('cyan is hsl(191 97% 77%)', () => {
      expect(DRACULA.cyan).toBe('hsl(191 97% 77%)')
    })

    it('green is hsl(135 94% 65%)', () => {
      expect(DRACULA.green).toBe('hsl(135 94% 65%)')
    })

    it('pink is hsl(326 100% 74%)', () => {
      expect(DRACULA.pink).toBe('hsl(326 100% 74%)')
    })

    it('orange is hsl(31 100% 71%)', () => {
      expect(DRACULA.orange).toBe('hsl(31 100% 71%)')
    })

    it('red is hsl(0 100% 67%)', () => {
      expect(DRACULA.red).toBe('hsl(0 100% 67%)')
    })

    it('yellow is hsl(65 92% 76%)', () => {
      expect(DRACULA.yellow).toBe('hsl(65 92% 76%)')
    })

    it('comment is hsl(225 27% 51%)', () => {
      expect(DRACULA.comment).toBe('hsl(225 27% 51%)')
    })

    it('all color values are non-empty strings', () => {
      for (const value of Object.values(DRACULA)) {
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      }
    })

    it('all color values are unique (no duplicate HSL strings)', () => {
      const values = Object.values(DRACULA)
      const unique = new Set(values)
      expect(unique.size).toBe(values.length)
    })
  })

  // ── STATUS_COLORS ────────────────────────────────────────────────────────────

  describe('STATUS_COLORS', () => {
    const expectedStatuses = ['completed', 'failed', 'canceled', 'running', 'queued']

    it('contains all expected status keys', () => {
      for (const status of expectedStatuses) {
        expect(STATUS_COLORS).toHaveProperty(status)
      }
    })

    it('exports exactly 5 status mappings', () => {
      expect(Object.keys(STATUS_COLORS)).toHaveLength(5)
    })

    it('all status color values are non-empty strings', () => {
      for (const value of Object.values(STATUS_COLORS)) {
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      }
    })

    it('all status color values are valid HSL strings', () => {
      for (const value of Object.values(STATUS_COLORS)) {
        expect(value).toMatch(/^hsl\(\d+\s+\d+%\s+\d+%\)$/)
      }
    })

    it('completed maps to DRACULA.purple', () => {
      expect(STATUS_COLORS['completed']).toBe(DRACULA.purple)
    })

    it('failed maps to DRACULA.pink', () => {
      expect(STATUS_COLORS['failed']).toBe(DRACULA.pink)
    })

    it('canceled maps to DRACULA.orange', () => {
      expect(STATUS_COLORS['canceled']).toBe(DRACULA.orange)
    })

    it('running maps to DRACULA.cyan', () => {
      expect(STATUS_COLORS['running']).toBe(DRACULA.cyan)
    })

    it('queued maps to DRACULA.comment', () => {
      expect(STATUS_COLORS['queued']).toBe(DRACULA.comment)
    })

    it('returns undefined for an unknown status', () => {
      expect(STATUS_COLORS['unknown']).toBeUndefined()
    })

    it('returns undefined for empty string status', () => {
      expect(STATUS_COLORS['']).toBeUndefined()
    })

    it('status keys are lowercase (case-sensitive map)', () => {
      expect(STATUS_COLORS['Completed']).toBeUndefined()
      expect(STATUS_COLORS['RUNNING']).toBeUndefined()
    })

    it('all values reference colors from the DRACULA palette', () => {
      const draculaValues = new Set(Object.values(DRACULA))
      for (const value of Object.values(STATUS_COLORS)) {
        expect(draculaValues.has(value)).toBe(true)
      }
    })
  })

  // ── CHART_PALETTE ────────────────────────────────────────────────────────────

  describe('CHART_PALETTE', () => {
    it('is an array', () => {
      expect(Array.isArray(CHART_PALETTE)).toBe(true)
    })

    it('contains exactly 5 colors', () => {
      expect(CHART_PALETTE).toHaveLength(5)
    })

    it('all entries are non-empty strings', () => {
      for (const color of CHART_PALETTE) {
        expect(typeof color).toBe('string')
        expect(color.length).toBeGreaterThan(0)
      }
    })

    it('all entries are valid HSL strings', () => {
      for (const color of CHART_PALETTE) {
        expect(color).toMatch(/^hsl\(\d+\s+\d+%\s+\d+%\)$/)
      }
    })

    it('first color is DRACULA.purple', () => {
      expect(CHART_PALETTE[0]).toBe(DRACULA.purple)
    })

    it('second color is DRACULA.cyan', () => {
      expect(CHART_PALETTE[1]).toBe(DRACULA.cyan)
    })

    it('third color is DRACULA.green', () => {
      expect(CHART_PALETTE[2]).toBe(DRACULA.green)
    })

    it('fourth color is DRACULA.pink', () => {
      expect(CHART_PALETTE[3]).toBe(DRACULA.pink)
    })

    it('fifth color is DRACULA.orange', () => {
      expect(CHART_PALETTE[4]).toBe(DRACULA.orange)
    })

    it('all palette entries reference colors from the DRACULA palette', () => {
      const draculaValues = new Set(Object.values(DRACULA))
      for (const color of CHART_PALETTE) {
        expect(draculaValues.has(color)).toBe(true)
      }
    })

    it('palette entries are unique (no repeated color)', () => {
      const unique = new Set(CHART_PALETTE)
      expect(unique.size).toBe(CHART_PALETTE.length)
    })

    it('does not include DRACULA.red (reserved for error states)', () => {
      expect(CHART_PALETTE).not.toContain(DRACULA.red)
    })

    it('does not include DRACULA.yellow', () => {
      expect(CHART_PALETTE).not.toContain(DRACULA.yellow)
    })

    it('does not include DRACULA.comment', () => {
      expect(CHART_PALETTE).not.toContain(DRACULA.comment)
    })
  })
})
