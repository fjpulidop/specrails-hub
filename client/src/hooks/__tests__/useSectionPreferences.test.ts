import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSectionPreferences, DEFAULT_ORDER, type SectionId } from '../useSectionPreferences'

const STORAGE_KEY = 'specrails.dashboard.sectionPrefs'

describe('useSectionPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('returns default order when no stored prefs', () => {
      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.order).toEqual(DEFAULT_ORDER)
    })

    it('returns all sections collapsed (not expanded) by default', () => {
      const { result } = renderHook(() => useSectionPreferences())
      for (const id of DEFAULT_ORDER) {
        expect(result.current.isExpanded(id)).toBe(false)
      }
    })

    it('returns no sections pinned by default', () => {
      const { result } = renderHook(() => useSectionPreferences())
      for (const id of DEFAULT_ORDER) {
        expect(result.current.isPinned(id)).toBe(false)
      }
    })

    it('restores order from localStorage', () => {
      const customOrder: SectionId[] = ['jobs', 'health', 'commands', 'runbooks']
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: customOrder, pinned: [] }))

      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.order).toEqual(customOrder)
    })

    it('restores pinned state from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        order: DEFAULT_ORDER,
        pinned: ['health', 'jobs'],
      }))

      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.isPinned('health')).toBe(true)
      expect(result.current.isPinned('jobs')).toBe(true)
      expect(result.current.isPinned('commands')).toBe(false)
    })

    it('pinned sections start expanded', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        order: DEFAULT_ORDER,
        pinned: ['health'],
      }))

      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.isExpanded('health')).toBe(true)
      expect(result.current.isExpanded('commands')).toBe(false)
    })

    it('falls back to defaults on corrupted localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json')

      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.order).toEqual(DEFAULT_ORDER)
    })
  })

  describe('reorder', () => {
    it('updates order and persists to localStorage', () => {
      const { result } = renderHook(() => useSectionPreferences())
      const newOrder: SectionId[] = ['jobs', 'commands', 'runbooks', 'health']

      act(() => {
        result.current.reorder(newOrder)
      })

      expect(result.current.order).toEqual(newOrder)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.order).toEqual(newOrder)
    })
  })

  describe('togglePin', () => {
    it('pins a section', () => {
      const { result } = renderHook(() => useSectionPreferences())

      act(() => {
        result.current.togglePin('health')
      })

      expect(result.current.isPinned('health')).toBe(true)
    })

    it('unpins a pinned section', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        order: DEFAULT_ORDER,
        pinned: ['health'],
      }))

      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.isPinned('health')).toBe(true)

      act(() => {
        result.current.togglePin('health')
      })

      expect(result.current.isPinned('health')).toBe(false)
    })

    it('persists pin state to localStorage', () => {
      const { result } = renderHook(() => useSectionPreferences())

      act(() => {
        result.current.togglePin('jobs')
      })

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.pinned).toContain('jobs')
    })
  })

  describe('toggleExpanded', () => {
    it('expands a collapsed section', () => {
      const { result } = renderHook(() => useSectionPreferences())
      expect(result.current.isExpanded('health')).toBe(false)

      act(() => {
        result.current.toggleExpanded('health')
      })

      expect(result.current.isExpanded('health')).toBe(true)
    })

    it('collapses an expanded section', () => {
      const { result } = renderHook(() => useSectionPreferences())

      act(() => {
        result.current.toggleExpanded('health')
      })
      expect(result.current.isExpanded('health')).toBe(true)

      act(() => {
        result.current.toggleExpanded('health')
      })
      expect(result.current.isExpanded('health')).toBe(false)
    })

    it('does not persist expand state to localStorage (transient)', () => {
      const { result } = renderHook(() => useSectionPreferences())

      act(() => {
        result.current.toggleExpanded('health')
      })

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      // expanded state is transient, should not be in localStorage
      expect(stored.expanded).toBeUndefined()
    })
  })
})
