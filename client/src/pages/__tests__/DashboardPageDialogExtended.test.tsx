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

// useProjectCache with proposal returning result_markdown and issue_url
const mockRefreshJobs = vi.fn()

vi.mock('../../hooks/useProjectCache', () => ({
  useProjectCache: ({ namespace }: { namespace: string }) => ({
    data: namespace === 'proposals'
      ? [{ id: 'prop-1', idea: 'Build amazing feature', status: 'created', created_at: '2024-01-01T00:00:00Z', issue_url: null }]
      : namespace === 'jobs'
      ? []
      : namespace === 'commands'
      ? []
      : [],
    isLoading: false,
    isFirstLoad: false,
    refresh: mockRefreshJobs,
  }),
}))

function setupWithProposal(proposalOverrides: Record<string, unknown> = {}) {
  const defaultProposal = {
    id: 'prop-1',
    idea: 'Build amazing feature',
    status: 'created',
    result_markdown: '# Result\n\nSome markdown content',
    issue_url: null,
    created_at: '2024-01-01T00:00:00Z',
    ...proposalOverrides,
  }

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ proposal: defaultProposal }),
  })
}

/** Expand the Jobs section and then click the proposal row */
async function openProposalDialog() {
  // Jobs section is collapsed by default — expand it first
  fireEvent.click(screen.getByTestId('toggle-jobs'))
  const proposalRow = screen.getByText(/sr:propose-feature/).closest('[role="button"]')
  if (proposalRow) {
    fireEvent.click(proposalRow)
  }
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/propose/'))
  })
}

describe('DashboardPage - proposal dialog content', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setupWithProposal()
  })

  it('opens proposal dialog after clicking proposal row', async () => {
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('Proposal')).toBeInTheDocument()
    })
  })

  it('renders proposal idea text in dialog', async () => {
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('Build amazing feature')).toBeInTheDocument()
    })
  })

  it('renders result_markdown when present', async () => {
    setupWithProposal({ result_markdown: 'Proposal Result Content' })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      // react-markdown renders it as a span (our mock)
      expect(screen.getByText('Proposal Result Content')).toBeInTheDocument()
    })
  })

  it('shows "No proposal content yet." when result_markdown is null', async () => {
    setupWithProposal({ result_markdown: null })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('No proposal content yet.')).toBeInTheDocument()
    })
  })

  it('renders GitHub Issue link when issue_url is set', async () => {
    setupWithProposal({
      issue_url: 'https://github.com/owner/repo/issues/42',
      result_markdown: null,
    })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('https://github.com/owner/repo/issues/42')).toBeInTheDocument()
    })
  })

  it('does not render GitHub Issue section when issue_url is null', async () => {
    setupWithProposal({ issue_url: null, result_markdown: null })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('No proposal content yet.')).toBeInTheDocument()
    })

    expect(screen.queryByText('GitHub Issue:')).not.toBeInTheDocument()
  })

  it('closes dialog when Close button is clicked', async () => {
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('Proposal')).toBeInTheDocument()
    })

    // There may be multiple close buttons (DialogContent X and Close button in footer)
    // Click the one in the footer (text = "Close")
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    // Click the last Close button (footer one)
    fireEvent.click(closeButtons[closeButtons.length - 1])

    await waitFor(() => {
      expect(screen.queryByText('Proposal')).not.toBeInTheDocument()
    })
  })

  it('calls DELETE and refreshes when Delete button in dialog is clicked', async () => {
    const { toast } = await import('sonner')

    // First fetch for proposal detail, second for delete
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal: {
            id: 'prop-1',
            idea: 'Build amazing feature',
            status: 'created',
            result_markdown: null,
            issue_url: null,
            created_at: '2024-01-01T00:00:00Z',
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // DELETE

    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/propose/prop-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(toast.success).toHaveBeenCalledWith('Proposal deleted')
    })
  })

  it('shows status badge in proposal dialog', async () => {
    setupWithProposal({ status: 'created', result_markdown: null })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('created')).toBeInTheDocument()
    })
  })

  it('shows cancelled status badge in proposal dialog', async () => {
    setupWithProposal({ status: 'cancelled', result_markdown: null })
    render(<DashboardPage />)
    await openProposalDialog()

    await waitFor(() => {
      expect(screen.getByText('cancelled')).toBeInTheDocument()
    })
  })

  it('Spec section heading always renders regardless of loading state', () => {
    render(<DashboardPage />)
    // Spec heading is always present
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })

  it('proposal idea shorter than 60 chars is not truncated in command', () => {
    // The mock proposal has idea 'Build amazing feature' (22 chars) — no truncation
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('toggle-jobs'))
    const row = screen.getByText(/sr:propose-feature/)
    expect(row.textContent).toContain('Build amazing feature')
    expect(row.textContent).not.toContain('...')
  })
})
