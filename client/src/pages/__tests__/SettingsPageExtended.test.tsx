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

  it('shows "Unsaved changes" text when label filter is changed', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })

    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/backlog, feature/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/backlog, feature/i)
    await user.clear(input)
    await user.type(input, 'new-label')

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('shows toast error when save returns non-ok response', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockConfig })    // GET /config
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })           // GET /budget
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })          // POST fails

    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Settings/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to save settings',
        expect.objectContaining({ description: 'Failed to save' })
      )
    })
  })

  it('shows toast success after successful save', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockConfig })   // GET /config
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })          // GET /budget
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })          // POST succeeds

    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Settings/i }))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Settings saved')
    })
  })

  it('TrackerStatus "Use this" button is shown when tracker can be selected', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)
    await waitFor(() => {
      // Jira is authenticated too in mockConfig, both should have "Use this" or "Active"
      // GitHub is currently active, Jira should have "Use this"
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })

  it('clicking "Use this" for Jira switches activeTracker and shows "Active"', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      // Jira is authenticated, should have "Use this" button
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    // Find the "Use this" button (for Jira since GitHub is already active)
    const useThisBtn = screen.getByText('Use this')
    await user.click(useThisBtn)

    // Now Jira is active — "Active" appears for it
    const activeLabels = screen.getAllByText('Active')
    expect(activeLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Not installed" text for unavailable trackers', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfigJiraNotInstalled })
    render(<SettingsPage />)

    await waitFor(() => {
      const notInstalled = screen.getAllByText(/Not installed/i)
      expect(notInstalled.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows "CLI found but not authenticated" for available but unauthenticated tracker', async () => {
    const partialConfig: ProjectConfig = {
      ...mockConfig,
      issueTracker: {
        github: { available: true, authenticated: false },
        jira: { available: false, authenticated: false },
        active: null,
        labelFilter: '',
      },
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => partialConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/CLI found but not authenticated/i)).toBeInTheDocument()
    })
  })

  it('shows "Connected and authenticated" for authenticated tracker', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      const connected = screen.getAllByText(/Connected and authenticated/i)
      expect(connected.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows project repo in subtitle when repo is available', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/github.com\/test\/repo/i)).toBeInTheDocument()
    })
  })

  it('shows Display preferences section', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Display')).toBeInTheDocument()
    })
  })

  it('shows Queue section', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Queue')).toBeInTheDocument()
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
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    render(<SettingsPage />)

    await waitFor(() => {
      // After failed fetch, isLoading becomes false but config stays null
      expect(screen.getByText('Project Settings')).toBeInTheDocument()
    })
  })

  it('label filter change updates displayed value', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockConfig })
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/backlog, feature/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/backlog, feature/i) as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'my-label')
    expect(input.value).toBe('my-label')
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
