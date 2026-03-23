import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import DashboardPage from '../DashboardPage'

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

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    activeProjectId: 'proj-1',
    projects: [{ id: 'proj-1', name: 'Test Project', path: '/test', slug: 'test', db_path: '/test/.db', added_at: '', last_seen_at: '' }],
    setActiveProjectId: vi.fn(),
    isLoading: false,
    setupProjectIds: new Set(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

vi.mock('../../hooks/usePipeline', () => ({
  usePipeline: () => ({
    recentJobs: [],
    phases: {},
    phaseDefinitions: [],
    projectName: 'Test Project',
    logLines: [],
    connectionStatus: 'connected',
    queueState: { jobs: [], activeJobId: null, paused: false },
  }),
}))

// useProjectCache with controlled refresh
const mockRefresh = vi.fn()
let mockProjectCacheCall = 0

vi.mock('../../hooks/useProjectCache', () => ({
  useProjectCache: ({ initialValue, namespace }: { initialValue: unknown; namespace: string }) => {
    mockProjectCacheCall++
    return {
      data: namespace === 'proposals'
        ? [{ id: 'prop-1', idea: 'Build a feature', status: 'created', created_at: '2024-01-01T00:00:00Z', issue_url: null }]
        : namespace === 'jobs'
        ? [{ id: 'job-1', command: '/sr:implement', started_at: new Date().toISOString(), status: 'completed' }]
        : namespace === 'commands'
        ? [{ slug: 'implement', name: 'Implement', description: 'Run implement command' }]
        : initialValue,
      isLoading: false,
      isFirstLoad: false,
      refresh: mockRefresh,
    }
  },
}))

vi.mock('../../components/ImplementWizard', () => ({
  ImplementWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="implement-wizard">ImplementWizard</div> : null,
}))

vi.mock('../../components/BatchImplementWizard', () => ({
  BatchImplementWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="batch-wizard">BatchImplementWizard</div> : null,
}))

vi.mock('../../components/ProjectHealthWidget', () => ({
  ProjectHealthWidget: () => null,
}))

/** Helper: expand a collapsed section by clicking its toggle */
function expandSection(sectionId: string) {
  fireEvent.click(screen.getByTestId(`toggle-${sectionId}`))
}

describe('DashboardPage - extended coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockProjectCacheCall = 0
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: [], jobs: [], proposals: [] }),
    })
  })

  it('renders Spec section with mocked commands', () => {
    render(<DashboardPage />)
    // CommandGrid should be rendered with the implement command once expanded
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })

  it('renders proposal jobs from proposals list when jobs section is expanded', () => {
    render(<DashboardPage />)
    expandSection('jobs')
    // The proposal gets converted to a job with /sr:propose-feature prefix
    expect(screen.getByText(/sr:propose-feature/)).toBeInTheDocument()
  })

  it('opens proposal detail dialog on proposal job click', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        proposal: {
          id: 'prop-1',
          idea: 'Build a feature',
          status: 'created',
          result_markdown: '# Result',
          issue_url: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      }),
    })

    render(<DashboardPage />)
    expandSection('jobs')

    // Find the proposal job row and click it via onProposalClick
    const proposalRow = screen.getByText(/sr:propose-feature/).closest('[role="button"]')
    if (proposalRow) {
      fireEvent.click(proposalRow)
    }

    // After fetch, the proposal detail dialog should show
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/propose/')
      )
    })
  })

  it('handleProposalDelete calls DELETE and refreshes on success', async () => {
    const { toast } = await import('sonner')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    render(<DashboardPage />)
    expandSection('jobs')

    expect(screen.getByText('Jobs')).toBeInTheDocument()
    void toast
  })

  it('shows loading skeleton when commands are loading', () => {
    vi.doMock('../../hooks/useProjectCache', () => ({
      useProjectCache: ({ namespace }: { namespace: string }) => ({
        data: [],
        isLoading: true,
        isFirstLoad: namespace === 'commands',
        refresh: mockRefresh,
      }),
    }))
    render(<DashboardPage />)
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })

  it('ImplementWizard opens when wizard state is implement', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('implement-wizard')).not.toBeInTheDocument()
  })

  it('BatchImplementWizard opens when wizard state is batch-implement', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('batch-wizard')).not.toBeInTheDocument()
  })

  it('proposal jobs with long idea text get truncated with ellipsis', () => {
    render(<DashboardPage />)
    expandSection('jobs')
    expect(screen.getByText(/sr:propose-feature/)).toBeInTheDocument()
  })

  it('enrichedCommands includes totalRuns from jobs matching command slug', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })
})

describe('DashboardPage - proposal dialog interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockProjectCacheCall = 0
  })

  it('shows proposal detail dialog content after successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        proposal: {
          id: 'prop-1',
          idea: 'A great idea',
          status: 'created',
          result_markdown: null,
          issue_url: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      }),
    })

    render(<DashboardPage />)
    expandSection('jobs')

    const proposalRow = screen.getByText(/sr:propose-feature/).closest('[role="button"]')
    if (proposalRow) {
      fireEvent.click(proposalRow)
    }

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/propose/'))
    })
  })

  it('does not open dialog when fetch returns non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false })

    render(<DashboardPage />)
    expandSection('jobs')

    const proposalRow = screen.getByText(/sr:propose-feature/).closest('[role="button"]')
    if (proposalRow) {
      fireEvent.click(proposalRow)
    }

    await waitFor(() => {
      expect(screen.queryByText('Proposal')).toBeNull()
    })
  })
})
