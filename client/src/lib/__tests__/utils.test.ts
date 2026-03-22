import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn', () => {
  // ── Basic class merging ──────────────────────────────────────────────────────

  describe('basic class concatenation', () => {
    it('returns a single class unchanged', () => {
      expect(cn('foo')).toBe('foo')
    })

    it('joins two simple classes with a space', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('joins multiple classes', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c')
    })

    it('returns empty string when called with no arguments', () => {
      expect(cn()).toBe('')
    })

    it('ignores undefined arguments', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar')
    })

    it('ignores null arguments', () => {
      expect(cn('foo', null, 'bar')).toBe('foo bar')
    })

    it('ignores false arguments', () => {
      expect(cn('foo', false, 'bar')).toBe('foo bar')
    })

    it('ignores empty string arguments', () => {
      expect(cn('', 'foo', '')).toBe('foo')
    })
  })

  // ── Conditional classes (clsx behaviour) ────────────────────────────────────

  describe('conditional classes via objects', () => {
    it('includes class when condition is true', () => {
      expect(cn({ 'text-red-500': true })).toBe('text-red-500')
    })

    it('excludes class when condition is false', () => {
      expect(cn({ 'text-red-500': false })).toBe('')
    })

    it('mixes static and conditional classes', () => {
      expect(cn('base', { 'text-red-500': true, 'text-blue-500': false })).toBe(
        'base text-red-500',
      )
    })

    it('handles multiple conditional classes', () => {
      expect(cn({ active: true, disabled: false, highlighted: true })).toBe('active highlighted')
    })

    it('handles truthy non-boolean condition', () => {
      const count = 3
      expect(cn({ 'has-items': count > 0 })).toBe('has-items')
    })
  })

  // ── Array inputs (clsx behaviour) ────────────────────────────────────────────

  describe('array inputs', () => {
    it('flattens an array of class names', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar')
    })

    it('flattens nested arrays', () => {
      expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz')
    })

    it('ignores falsy values inside arrays', () => {
      expect(cn(['foo', false, null, undefined, 'bar'])).toBe('foo bar')
    })

    it('handles array of conditional objects', () => {
      expect(cn([{ active: true }, { disabled: false }])).toBe('active')
    })
  })

  // ── Tailwind conflict resolution (twMerge behaviour) ────────────────────────

  describe('tailwind class conflict resolution', () => {
    it('last padding wins when conflicting p-* utilities are given', () => {
      expect(cn('p-2', 'p-4')).toBe('p-4')
    })

    it('last text color wins when conflicting text-* utilities are given', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('last background color wins', () => {
      expect(cn('bg-white', 'bg-gray-900')).toBe('bg-gray-900')
    })

    it('merges non-conflicting tailwind utilities without duplication', () => {
      const result = cn('px-2', 'py-4')
      expect(result).toContain('px-2')
      expect(result).toContain('py-4')
    })

    it('keeps dark: variant classes that do not conflict with light classes', () => {
      const result = cn('bg-white', 'dark:bg-gray-900')
      expect(result).toContain('bg-white')
      expect(result).toContain('dark:bg-gray-900')
    })

    it('resolves conflict between conflicting font-size utilities', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    })

    it('resolves conflict between conflicting margin utilities', () => {
      expect(cn('m-2', 'm-6')).toBe('m-6')
    })

    it('does not duplicate the same class', () => {
      const result = cn('flex', 'flex')
      // twMerge deduplicates identical conflicting classes — result should not double up
      expect(result.split(' ').filter((c) => c === 'flex')).toHaveLength(1)
    })
  })

  // ── Combined clsx + twMerge scenarios ────────────────────────────────────────

  describe('combined conditional + conflict resolution', () => {
    it('picks winning utility from a conditional set', () => {
      // text-sm is conditional=false, text-lg wins via twMerge
      expect(cn('text-sm', { 'text-lg': true })).toBe('text-lg')
    })

    it('conditional false prevents that class from entering merge', () => {
      expect(cn('text-sm', { 'text-lg': false })).toBe('text-sm')
    })

    it('builds a realistic button class string', () => {
      const isDisabled = false
      const isPrimary = true
      const result = cn(
        'inline-flex items-center rounded px-4 py-2',
        { 'bg-blue-600 text-white': isPrimary, 'bg-gray-200 text-gray-800': !isPrimary },
        { 'opacity-50 cursor-not-allowed': isDisabled },
      )
      expect(result).toContain('inline-flex')
      expect(result).toContain('bg-blue-600')
      expect(result).toContain('text-white')
      expect(result).not.toContain('bg-gray-200')
      expect(result).not.toContain('opacity-50')
    })

    it('handles the className override pattern used in Shadcn components', () => {
      // Component default + caller override: caller's p-6 replaces default p-4
      const defaultClass = 'rounded p-4 bg-white'
      const overrideClass = 'p-6'
      expect(cn(defaultClass, overrideClass)).toBe('rounded bg-white p-6')
    })
  })

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles a class name with leading/trailing spaces (clsx trims via join)', () => {
      // clsx does not trim individual strings but the final join + split approach
      // means extra whitespace inside a single string is kept as-is by clsx
      const result = cn('foo  bar')
      expect(result).toContain('foo')
      expect(result).toContain('bar')
    })

    it('handles numeric zero as falsy (omitted)', () => {
      expect(cn('foo', 0 as unknown as string, 'bar')).toBe('foo bar')
    })

    it('returns string type always', () => {
      expect(typeof cn()).toBe('string')
      expect(typeof cn('a', 'b')).toBe('string')
      expect(typeof cn(undefined)).toBe('string')
    })
  })
})
