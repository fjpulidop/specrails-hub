import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { RecentJobs } from '../RecentJobs'
import type { JobSummary } from '../../types'

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

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockJobs: JobSummary[] = [
  {
    id: 'job-1',
    command: '/sr:implement',
    started_at: new Date().toISOString(),
    status: 'completed',
    duration_ms: 30000,
    total_cost_usd: 0.05,
    tokens_out: 1500,
  },
  {
    id: 'job-2',
    command: '/sr:propose-spec',
    started_at: new Date().toISOString(),
    status: 'running',
  },
  {
    id: 'job-3',
    command: '/sr:health-check',
    started_at: new Date().toISOString(),
    status: 'failed',
  },
]

describe('RecentJobs', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.clearAllMocks()
  })

  it('shows "No jobs yet" empty state when jobs array is empty', () => {
    render(<RecentJobs jobs={[]} />)
    expect(screen.getByText(/No jobs yet/i)).toBeInTheDocument()
  })

  it('shows loading skeleton when isLoading is true', () => {
    const { container } = render(<RecentJobs jobs={[]} isLoading={true} />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders job list with status badges', () => {
    render(<RecentJobs jobs={mockJobs} />)
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('renders job commands', () => {
    render(<RecentJobs jobs={mockJobs} />)
    expect(screen.getByText('/sr:implement')).toBeInTheDocument()
    expect(screen.getByText('/sr:propose-spec')).toBeInTheDocument()
    expect(screen.getByText('/sr:health-check')).toBeInTheDocument()
  })

  it('renders "All" filter button with correct count', () => {
    render(<RecentJobs jobs={mockJobs} />)
    expect(screen.getByRole('button', { name: /All \(3\)/i })).toBeInTheDocument()
  })

  it('status filter buttons appear for statuses that have jobs', () => {
    render(<RecentJobs jobs={mockJobs} />)
    // completed, running, failed all have jobs
    expect(screen.getByRole('button', { name: /completed \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /running \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /failed \(1\)/i })).toBeInTheDocument()
  })

  it('clicking status filter shows only matching jobs', async () => {
    const user = userEvent.setup()
    render(<RecentJobs jobs={mockJobs} />)
    const completedFilter = screen.getByRole('button', { name: /completed \(1\)/i })
    await user.click(completedFilter)
    // Only completed job should be visible
    expect(screen.getByText('/sr:implement')).toBeInTheDocument()
    expect(screen.queryByText('/sr:propose-spec')).not.toBeInTheDocument()
    expect(screen.queryByText('/sr:health-check')).not.toBeInTheDocument()
  })

  it('clicking same filter again deselects it (shows all)', async () => {
    const user = userEvent.setup()
    render(<RecentJobs jobs={mockJobs} />)
    const completedFilter = screen.getByRole('button', { name: /completed \(1\)/i })
    await user.click(completedFilter)
    await user.click(completedFilter)
    expect(screen.getByText('/sr:implement')).toBeInTheDocument()
    expect(screen.getByText('/sr:propose-spec')).toBeInTheDocument()
    expect(screen.getByText('/sr:health-check')).toBeInTheDocument()
  })

  it('clicking job row navigates to job detail', async () => {
    const user = userEvent.setup()
    render(<RecentJobs jobs={mockJobs} />)
    const jobRow = screen.getByText('/sr:implement').closest('[role="button"]')!
    await user.click(jobRow)
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-1')
  })

  it('clicking proposal row calls onProposalClick instead of navigate', async () => {
    const user = userEvent.setup()
    const onProposalClick = vi.fn()
    const proposalJob: JobSummary = {
      id: 'proposal:abc123',
      command: '/sr:propose-feature some idea',
      started_at: new Date().toISOString(),
      status: 'completed',
    }
    render(<RecentJobs jobs={[proposalJob]} onProposalClick={onProposalClick} />)
    const row = screen.getByText('/sr:propose-feature some idea').closest('[role="button"]')!
    await user.click(row)
    expect(onProposalClick).toHaveBeenCalledWith('abc123')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows duration when available', () => {
    render(<RecentJobs jobs={mockJobs} />)
    // job-1 has duration_ms: 30000 → "30s"
    expect(screen.getByText('30s')).toBeInTheDocument()
  })
})
