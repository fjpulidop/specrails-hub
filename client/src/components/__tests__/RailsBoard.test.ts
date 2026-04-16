import { describe, it, expect } from 'vitest'
import { RAIL_SORT_PREFIX, railSortId, isRailSortId, extractRailId } from '../RailsBoard'

describe('RailsBoard utilities', () => {
  describe('railSortId', () => {
    it('prefixes a rail id with RAIL_SORT_PREFIX', () => {
      expect(railSortId('rail-1')).toBe(`${RAIL_SORT_PREFIX}rail-1`)
    })
  })

  describe('isRailSortId', () => {
    it('returns true for strings with the prefix', () => {
      expect(isRailSortId(`${RAIL_SORT_PREFIX}rail-1`)).toBe(true)
    })

    it('returns false for strings without the prefix', () => {
      expect(isRailSortId('rail-1')).toBe(false)
    })

    it('returns false for numbers', () => {
      expect(isRailSortId(42)).toBe(false)
    })
  })

  describe('extractRailId', () => {
    it('strips the prefix from a sort id', () => {
      expect(extractRailId(`${RAIL_SORT_PREFIX}my-rail`)).toBe('my-rail')
    })

    it('returns empty string when sort id equals only the prefix', () => {
      expect(extractRailId(RAIL_SORT_PREFIX)).toBe('')
    })
  })
})
