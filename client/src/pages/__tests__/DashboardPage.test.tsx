import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
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

vi.mock('../../components/PipelineBuilder', () => ({
  PipelineBuilder: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pipeline-builder">PipelineBuilder</div> : null,
}))


describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: [], jobs: [], proposals: [] }),
    })
  })

  // ─── Section headers (always visible, even when collapsed) ─────────────

  it('renders all four section headers', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Project Health')).toBeInTheDocument()
    expect(screen.getByText('Commands')).toBeInTheDocument()
    expect(screen.getByText('Runbooks')).toBeInTheDocument()
    expect(screen.getByText('Recent Jobs')).toBeInTheDocument()
  })

  it('renders section containers with test ids', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('section-health')).toBeInTheDocument()
    expect(screen.getByTestId('section-commands')).toBeInTheDocument()
    expect(screen.getByTestId('section-runbooks')).toBeInTheDocument()
    expect(screen.getByTestId('section-jobs')).toBeInTheDocument()
  })

  // ─── Default collapsed state ──────────────────────────────────────────

  it('all sections are collapsed by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('content-health')).not.toBeInTheDocument()
    expect(screen.queryByTestId('content-commands')).not.toBeInTheDocument()
    expect(screen.queryByTestId('content-runbooks')).not.toBeInTheDocument()
    expect(screen.queryByTestId('content-jobs')).not.toBeInTheDocument()
  })

  // ─── Expand/collapse ─────────────────────────────────────────────────

  it('expanding Commands section reveals content', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('toggle-commands'))
    expect(screen.getByTestId('content-commands')).toBeInTheDocument()
    // Should show empty state since commands are []
    expect(screen.getByText(/No commands installed/i)).toBeInTheDocument()
  })

  it('expanding Recent Jobs section reveals content', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('toggle-jobs'))
    expect(screen.getByTestId('content-jobs')).toBeInTheDocument()
    expect(screen.getByText(/No jobs yet/i)).toBeInTheDocument()
  })

  it('collapsing an expanded section hides content', () => {
    render(<DashboardPage />)
    // Expand then collapse
    fireEvent.click(screen.getByTestId('toggle-commands'))
    expect(screen.getByTestId('content-commands')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('toggle-commands'))
    expect(screen.queryByTestId('content-commands')).not.toBeInTheDocument()
  })

  // ─── Pin buttons ─────────────────────────────────────────────────────

  it('renders pin buttons for each section', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('pin-health')).toBeInTheDocument()
    expect(screen.getByTestId('pin-commands')).toBeInTheDocument()
    expect(screen.getByTestId('pin-runbooks')).toBeInTheDocument()
    expect(screen.getByTestId('pin-jobs')).toBeInTheDocument()
  })

  // ─── Drag handles ────────────────────────────────────────────────────

  it('renders drag handles for each section', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('drag-handle-health')).toBeInTheDocument()
    expect(screen.getByTestId('drag-handle-commands')).toBeInTheDocument()
    expect(screen.getByTestId('drag-handle-runbooks')).toBeInTheDocument()
    expect(screen.getByTestId('drag-handle-jobs')).toBeInTheDocument()
  })

  // ─── Pinned sections start expanded on reload ────────────────────────

  it('pinned sections start expanded', () => {
    localStorage.setItem('specrails.dashboard.sectionPrefs', JSON.stringify({
      order: ['health', 'runbooks', 'commands', 'jobs'],
      pinned: ['commands'],
    }))

    render(<DashboardPage />)
    // Commands should be expanded because it's pinned
    expect(screen.getByTestId('content-commands')).toBeInTheDocument()
    // Others remain collapsed
    expect(screen.queryByTestId('content-health')).not.toBeInTheDocument()
    expect(screen.queryByTestId('content-jobs')).not.toBeInTheDocument()
  })

  // ─── Wizards ─────────────────────────────────────────────────────────

  it('ImplementWizard is not shown by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('implement-wizard')).not.toBeInTheDocument()
  })

  it('BatchImplementWizard is not shown by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('batch-wizard')).not.toBeInTheDocument()
  })

  it('PipelineBuilder is not shown by default', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('pipeline-builder')).not.toBeInTheDocument()
  })
})
