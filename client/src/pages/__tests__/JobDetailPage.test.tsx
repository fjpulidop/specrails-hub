import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import JobDetailPage from '../JobDetailPage'
import type { JobSummary, EventRow } from '../../types'

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
vi.mock('../../lib/markdown-detect', () => ({
  hasMarkdownSyntax: () => false,
}))

const mockNavigate = vi.fn()

// Mock useParams + useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: 'job-abc123' }),
    useNavigate: () => mockNavigate,
  }
})

// Mock useHub
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

// Mock useSharedWebSocket
const mockRegisterHandler = vi.fn()
const mockUnregisterHandler = vi.fn()
vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: mockRegisterHandler,
    unregisterHandler: mockUnregisterHandler,
    connectionStatus: 'connected',
  }),
}))

const mockJob: JobSummary = {
  id: 'job-abc123',
  command: '/sr:implement',
  started_at: '2024-01-15T10:00:00Z',
  finished_at: '2024-01-15T10:00:30Z',
  status: 'completed',
  total_cost_usd: 0.05,
  duration_ms: 30000,
  model: 'claude-sonnet-4-5',
}

const mockEvents: EventRow[] = [
  {
    id: 1,
    job_id: 'job-abc123',
    seq: 1,
    event_type: 'log',
    source: 'stdout',
    payload: JSON.stringify({ line: 'Starting implementation...' }),
    timestamp: '2024-01-15T10:00:01Z',
  },
]

describe('JobDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { container } = render(<JobDetailPage />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders job details when job is found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('/sr:implement')).toBeInTheDocument()
    })
  })

  it('shows job status badge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument()
    })
  })

  it('shows breadcrumb with job id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Job #job-abc1/i)).toBeInTheDocument()
    })
  })

  it('shows 404 state when job not found (404 response)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Job not found/i)).toBeInTheDocument()
    })
  })

  it('shows 404 state when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Job not found/i)).toBeInTheDocument()
    })
  })

  it('shows Back to Dashboard link in 404 state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Back to Dashboard/i })).toBeInTheDocument()
    })
  })

  it('does not show Cancel Job button for completed jobs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('/sr:implement')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Cancel Job/i })).not.toBeInTheDocument()
  })

  it('shows Cancel Job button for running jobs', async () => {
    const runningJob = { ...mockJob, status: 'running' as const }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: runningJob, events: [] }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel Job/i })).toBeInTheDocument()
    })
  })

  it('Cancel button sends DELETE request', async () => {
    const user = userEvent.setup()
    const runningJob = { ...mockJob, status: 'running' as const }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: runningJob, events: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel Job/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Cancel Job/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs/job-abc123',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  it('registers WebSocket handler on mount', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(mockRegisterHandler).toHaveBeenCalled()
    })
  })

  it('re-fetches job when queue message transitions job to completed', async () => {
    const runningJob = { ...mockJob, status: 'running' as const, duration_ms: null, total_cost_usd: null }
    const completedJob = { ...mockJob, status: 'completed' as const, duration_ms: 30000, total_cost_usd: 0.05 }

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: runningJob, events: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: completedJob, events: mockEvents }) })

    render(<JobDetailPage />)
    await waitFor(() => {
      expect(mockRegisterHandler).toHaveBeenCalled()
    })

    const handler = mockRegisterHandler.mock.calls[0][1]
    handler({ type: 'queue', projectId: 'proj-1', jobs: [{ id: 'job-abc123', status: 'completed' }] })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenLastCalledWith('/api/jobs/job-abc123')
    })
  })

  it('renders log viewer section', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      // LogViewer shows the log line
      expect(screen.getByText('Starting implementation...')).toBeInTheDocument()
    })
  })

  it('renders Dashboard link in breadcrumb', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    })
  })

  it('shows Re-execute button for completed jobs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: mockJob, events: mockEvents }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-execute/i })).toBeInTheDocument()
    })
  })

  it('shows Re-execute button for failed jobs', async () => {
    const failedJob = { ...mockJob, status: 'failed' as const }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: failedJob, events: [] }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-execute/i })).toBeInTheDocument()
    })
  })

  it('does not show Re-execute button for running jobs', async () => {
    const runningJob = { ...mockJob, status: 'running' as const }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: runningJob, events: [] }),
    })
    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel Job/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Re-execute/i })).not.toBeInTheDocument()
  })

  it('Re-execute spawns new job and navigates to new job detail', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: mockJob, events: mockEvents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ jobId: 'new-job-id' }) })

    render(<JobDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-execute/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Re-execute/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spawn',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ command: '/sr:implement' }),
        })
      )
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/new-job-id')
    })
  })

})
