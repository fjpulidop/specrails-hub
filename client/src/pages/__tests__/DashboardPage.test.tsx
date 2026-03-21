import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
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

// Mock useHub
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

// Mock usePipeline
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

// Mock useProjectCache
vi.mock('../../hooks/useProjectCache', () => ({
  useProjectCache: ({ initialValue }: { initialValue: unknown }) => ({
    data: initialValue,
    isLoading: false,
    isFirstLoad: false,
    refresh: vi.fn(),
  }),
}))

// Mock wizard components to avoid complex dependencies
vi.mock('../../components/ImplementWizard', () => ({
  ImplementWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="implement-wizard">ImplementWizard</div> : null,
}))

vi.mock('../../components/BatchImplementWizard', () => ({
  BatchImplementWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="batch-wizard">BatchImplementWizard</div> : null,
}))


describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: [], jobs: [], proposals: [] }),
    })
  })

  it('renders Commands section heading', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Commands')).toBeInTheDocument()
  })

  it('renders Recent Jobs section heading', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Recent Jobs')).toBeInTheDocument()
  })

  it('shows empty state for commands when no commands available', () => {
    render(<DashboardPage />)
    expect(screen.getByText(/No commands installed/i)).toBeInTheDocument()
  })

  it('shows empty state for jobs when no jobs available', () => {
    render(<DashboardPage />)
    expect(screen.getByText(/No jobs yet/i)).toBeInTheDocument()
  })

  it('ImplementWizard is not shown by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('implement-wizard')).not.toBeInTheDocument()
  })

  it('BatchImplementWizard is not shown by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('batch-wizard')).not.toBeInTheDocument()
  })
})
