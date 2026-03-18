import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import SettingsPage from '../SettingsPage'
import type { ProjectConfig } from '../../types'

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api',
}))

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    activeProjectId: 'proj-1',
    projects: [],
    isLoading: false,
    setupProjectIds: new Set(),
    setActiveProjectId: vi.fn(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

const mockConfig: ProjectConfig = {
  project: { name: 'Test Project', repo: 'github.com/test/repo' },
  issueTracker: {
    github: { available: true, authenticated: true },
    jira: { available: false, authenticated: false },
    active: 'github',
    labelFilter: 'backlog',
  },
  commands: [],
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton initially when fetch is in-flight', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { container } = render(<SettingsPage />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders Settings heading after load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  it('loads config on mount and shows project name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Test Project/i)).toBeInTheDocument()
    })
  })

  it('shows GitHub tracker section', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument()
    })
  })

  it('shows Jira tracker section', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('Jira')).toBeInTheDocument()
    })
  })

  it('renders Save Settings button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument()
    })
  })

  it('Save button triggers POST to /api/config', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockConfig })  // GET config
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })        // POST config

    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Settings/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('shows label filter input with correct value from config', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/backlog, feature/i) as HTMLInputElement
      expect(input.value).toBe('backlog')
    })
  })

  it('shows Issue Tracker section heading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('Issue Tracker')).toBeInTheDocument()
    })
  })
})
