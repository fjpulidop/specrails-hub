import { describe, it, expect, beforeEach } from 'vitest'
import { setApiContext, setHubMode, getApiBase } from '../api'

describe('api', () => {
  // Reset to legacy defaults before each test
  beforeEach(() => {
    setApiContext(false, null)
  })

  describe('getApiBase', () => {
    it('returns /api in legacy mode (isHub=false)', () => {
      setApiContext(false, null)
      expect(getApiBase()).toBe('/api')
    })

    it('returns /api when isHub=true but no projectId', () => {
      setApiContext(true, null)
      expect(getApiBase()).toBe('/api')
    })

    it('returns /api/projects/<id> in hub mode with a project ID', () => {
      setApiContext(true, 'proj-123')
      expect(getApiBase()).toBe('/api/projects/proj-123')
    })

    it('updates when project ID changes', () => {
      setApiContext(true, 'proj-aaa')
      expect(getApiBase()).toBe('/api/projects/proj-aaa')

      setApiContext(true, 'proj-bbb')
      expect(getApiBase()).toBe('/api/projects/proj-bbb')
    })

    it('falls back to /api when switched back to legacy mode', () => {
      setApiContext(true, 'proj-xyz')
      expect(getApiBase()).toBe('/api/projects/proj-xyz')

      setApiContext(false, null)
      expect(getApiBase()).toBe('/api')
    })
  })

  describe('setApiContext', () => {
    it('accepts project ID with special chars (URL-safe)', () => {
      setApiContext(true, 'my-project_001')
      expect(getApiBase()).toBe('/api/projects/my-project_001')
    })

    it('ignores projectId when isHub is false even if provided', () => {
      setApiContext(false, 'proj-ignored')
      expect(getApiBase()).toBe('/api')
    })
  })

  describe('setHubMode', () => {
    it('sets hub mode without clearing active project', () => {
      setApiContext(true, 'proj-123')
      setHubMode(true)
      expect(getApiBase()).toBe('/api/projects/proj-123')
    })

    it('disables hub mode without clearing project ID', () => {
      setApiContext(true, 'proj-123')
      setHubMode(false)
      expect(getApiBase()).toBe('/api')
    })
  })
})
