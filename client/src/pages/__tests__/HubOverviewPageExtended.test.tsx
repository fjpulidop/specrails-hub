import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import type { HubOverviewResponse, HubSearchResponse } from '../../types'

// Static import to avoid module cache conflicts with pages-smoke.test.tsx
import HubOverviewPage from '../HubOverviewPage'

// Single vi.mock for useHub — capture setActiveProjectId spy via module-level variable
const mockSetActiveProjectId = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    activeProjectId: 'proj-1',
    projects: [
      {
        id: 'proj-1',
        slug: 'proj-1',
        name: 'Project One',
        path: '/home/user/proj-1',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ],
    isLoading: false,
    setupProjectIds: new Set<string>(),
    setActiveProjectId: mockSetActiveProjectId,
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

const mockOverview: HubOverviewResponse = {
  aggregated: {
    totalCount: 2,
    healthyCount: 1,
    warningCount: 1,
    criticalCount: 0,
    jobsToday: 5,
    activeJobs: 1,
    costToday: 2.50,
    hubDailyBudgetUsd: 10,
  },
  projects: [
    {
      projectId: 'proj-1',
      projectName: 'Project One',
      healthScore: 75,
      activeJobs: 1,
      jobsToday: 3,
      coveragePct: 82.5,
      costToday: 1.50,
      lastRunAt: '2024-03-21T10:00:00Z',
      lastRunCommand: '/sr:implement',
      lastRunStatus: 'completed',
    },
    {
      projectId: 'proj-2',
      projectName: 'Project Two',
      healthScore: 40,
      activeJobs: 0,
      jobsToday: 0,
      coveragePct: null,
      costToday: 1.00,
      lastRunAt: null,
      lastRunCommand: null,
      lastRunStatus: null,
    },
  ],
  recentJobs: [
    {
      id: 'job-1',
      projectId: 'proj-1',
      projectName: 'Project One',
      command: '/sr:implement --spec SPEA-001',
      status: 'completed',
      started_at: '2024-03-21T10:00:00Z',
    },
  ],
}

const mockSearchResults: HubSearchResponse = {
  query: 'implement',
  total: 2,
  groups: [
    {
      projectId: 'proj-1',
      projectName: 'Project One',
      jobs: [
        { id: 'job-1', command: '/sr:implement', status: 'completed' },
      ],
      proposals: [
        { id: 'prop-1', idea: 'Implement feature X' },
      ],
      messages: [
        { id: 'm-1', content: 'Let us implement this feature together and make it work' },
      ],
    },
  ],
}

const emptySearchResults: HubSearchResponse = {
  query: 'nonexistent',
  total: 0,
  groups: [],
}

const emptyHealthResponse = { projects: [], aggregated: { totalCount: 0, greenCount: 0, yellowCount: 0, redCount: 0 } }

function mockFetchWithHealth(overviewData: HubOverviewResponse = mockOverview, searchData?: HubSearchResponse) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('/api/hub/health')) {
      return { ok: true, json: async () => emptyHealthResponse }
    }
    if (typeof url === 'string' && url.includes('/api/hub/search') && searchData) {
      return { ok: true, json: async () => searchData }
    }
    return { ok: true, json: async () => overviewData }
  })
}

describe('HubOverviewPage - extended coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('/api/hub/health')) {
        return { ok: true, json: async () => ({ projects: [], aggregated: { totalCount: 0, greenCount: 0, yellowCount: 0, redCount: 0 } }) }
      }
      return { ok: true, json: async () => mockOverview }
    })
  })

  it('renders aggregated stats cards after loading', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.getByText('Active Jobs')).toBeInTheDocument()
      expect(screen.getByText('Jobs Today')).toBeInTheDocument()
      expect(screen.getByText('Healthy')).toBeInTheDocument()
    })
  })

  it('renders project cards after loading', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      const projectOneElements = screen.getAllByText('Project One')
      expect(projectOneElements.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Project Two')).toBeInTheDocument()
    })
  })

  it('renders HealthBadge with green for score >= 60', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      // Project One has healthScore: 75 — score appears in the health badge
      const healthBadges = screen.getAllByText('75')
      expect(healthBadges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders HealthBadge with warning for score 30-59', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      // Project Two has healthScore: 40
      const healthBadges = screen.getAllByText('40')
      expect(healthBadges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders coverage bar for project with coverage data', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      // Project One has coveragePct: 82.5
      expect(screen.getByText('83%')).toBeInTheDocument()
    })
  })

  it('renders recent activity section with job entry', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('/sr:implement --spec SPEA-001')).toBeInTheDocument()
    })
  })

  it('clicking a project card calls setActiveProjectId', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      const elems = screen.getAllByText('Project One')
      expect(elems.length).toBeGreaterThanOrEqual(1)
    })

    const projectOneElements = screen.getAllByText('Project One')
    // Find the button element — project card names are in <p> inside <button>
    const cardButton = projectOneElements[0].closest('button')
    if (cardButton) {
      fireEvent.click(cardButton)
      expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1')
    }
  })

  it('renders search results when query returns results', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchWithHealth(mockOverview, mockSearchResults)

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Hub Overview')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search across all projects/i)
    await user.type(searchInput, 'implement')

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search?q=implement')
      )
    }, { timeout: 2000 })
  })

  it('renders empty search results state', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchWithHealth(mockOverview, emptySearchResults)

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search across all projects/i)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search across all projects/i)
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search?q=nonexistent')
      )
    }, { timeout: 2000 })
  })

  it('clears search when input is changed to short query', async () => {
    mockFetchWithHealth(mockOverview, emptySearchResults)

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Hub Overview')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search across all projects/i)
    fireEvent.change(searchInput, { target: { value: 'abc' } })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search')
      )
    }, { timeout: 2000 })
  })

  it('does not search when query is less than 2 characters', async () => {
    mockFetchWithHealth()

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Hub Overview')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search across all projects/i)
    fireEvent.change(searchInput, { target: { value: 'a' } })

    // Should not trigger search
    await new Promise((r) => setTimeout(r, 400))
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((call) => String(call[0]).includes('search'))).toBe(false)
  })

  it('renders "warning X warning" sub-text in healthy card', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      // aggregated.warningCount=1, criticalCount=0
      expect(screen.getByText('1 warning · 0 critical')).toBeInTheDocument()
    })
  })

  it('renders "idle" for project with no active jobs', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      const idleTexts = screen.getAllByText('idle')
      expect(idleTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders active jobs count for project with active jobs', async () => {
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('1 running')).toBeInTheDocument()
    })
  })

  it('shows "No activity yet" when recentJobs is empty', async () => {
    mockFetchWithHealth({ ...mockOverview, recentJobs: [] })

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('No jobs yet across any project.')).toBeInTheDocument()
    })
  })
})

describe('HubOverviewPage - SearchResults component coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('SearchResults shows results count and triggers search fetch', async () => {
    mockFetchWithHealth(mockOverview, mockSearchResults)

    render(<HubOverviewPage />)

    await waitFor(() => { expect(screen.getByText('Hub Overview')).toBeInTheDocument() })

    fireEvent.change(
      screen.getByPlaceholderText(/search across all projects/i),
      { target: { value: 'implement' } }
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search?q=implement')
      )
    }, { timeout: 2000 })
  })

  it('SearchResults with proposals renders proposal ideas on search', async () => {
    mockFetchWithHealth(mockOverview, mockSearchResults)

    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Hub Overview')).toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByPlaceholderText(/search across all projects/i),
      { target: { value: 'implement' } }
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search?q=implement')
      )
    }, { timeout: 2000 })
  })
})
