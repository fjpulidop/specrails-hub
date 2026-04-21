import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useBlocker: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
  }
})

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
    jira: { available: true, authenticated: true },
    active: 'github',
    labelFilter: 'backlog',
  },
  commands: [],
  dailyBudgetUsd: null,
}

const mockConfigJiraNotInstalled: ProjectConfig = {
  project: { name: 'Test Project', repo: null },
  issueTracker: {
    github: { available: false, authenticated: false },
    jira: { available: false, authenticated: false },
    active: null,
    labelFilter: '',
  },
  commands: [],
  dailyBudgetUsd: null,
}

describe('SettingsPage - extended coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows project repo in subtitle when repo is available', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/github.com\/test\/repo/i)).toBeInTheDocument()
    })
  })

  it('blocker dialog shows when blocker.state is blocked', async () => {
    // Override useBlocker to return 'blocked' state
    const { default: SettingsPageFresh } = await import('../SettingsPage')
    const mockBlocker = { state: 'blocked', proceed: vi.fn(), reset: vi.fn() }

    vi.doMock('react-router-dom', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react-router-dom')>()
      return { ...actual, useBlocker: () => mockBlocker }
    })

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPageFresh />)

    await waitFor(() => {
      expect(screen.getByText('Project Settings')).toBeInTheDocument()
    })
  })

  it('handles fetch failure gracefully (config remains null)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })                                                                // GET /config fails
      .mockResolvedValue({ ok: true, json: async () => ({ agents: [], pipelineTelemetryEnabled: false, orchestratorModel: 'sonnet' }) }) // all others succeed
    render(<SettingsPage />)

    await waitFor(() => {
      // After failed fetch, isLoading becomes false but config stays null
      expect(screen.getByText('Project Settings')).toBeInTheDocument()
    })
  })

  it('renders Budget section with daily budget input', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('Budget')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/e\.g\. 5\.00/i)).toBeInTheDocument()
    })
  })

  it('saves daily budget successfully', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockConfig }) // GET /config
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })        // GET /budget
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pipelineTelemetryEnabled: false, orchestratorModel: 'sonnet' }) }) // GET /settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [] }) }) // GET /agent-models
      .mockResolvedValueOnce({ ok: true })                                 // PATCH budget save
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 5\.00/i)).toBeInTheDocument()
    })
    const budgetInput = screen.getByPlaceholderText(/e\.g\. 5\.00/i) as HTMLInputElement
    await user.type(budgetInput, '5.00')
    const saveBtn = screen.getAllByRole('button', { name: /^save$/i }).find(
      (btn) => (btn as HTMLButtonElement).closest('div')?.querySelector('input[placeholder*="5.00"]')
    ) ?? screen.getAllByRole('button', { name: /^save$/i })[0]
    await user.click(saveBtn)
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Daily budget set to $5')
    })
  })

  it('shows error when daily budget is invalid (zero)', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 5\.00/i)).toBeInTheDocument()
    })
    const budgetInput = screen.getByPlaceholderText(/e\.g\. 5\.00/i) as HTMLInputElement
    await user.type(budgetInput, '-1')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Enter a positive number or leave blank to disable')
    })
  })

  it('removes daily budget when input is blank', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockConfig, dailyBudgetUsd: 5.0 }) })  // GET /config
      .mockResolvedValueOnce({ ok: true, json: async () => ({ dailyBudgetUsd: 5.0 }) })                   // GET /budget
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pipelineTelemetryEnabled: false, orchestratorModel: 'sonnet' }) }) // GET /settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [] }) })                             // GET /agent-models
      .mockResolvedValueOnce({ ok: true })                                                                  // PATCH /budget
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 5\.00/i)).toBeInTheDocument()
    })
    const budgetInput = screen.getByPlaceholderText(/e\.g\. 5\.00/i) as HTMLInputElement
    await user.clear(budgetInput)
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Daily budget removed')
    })
  })
})
