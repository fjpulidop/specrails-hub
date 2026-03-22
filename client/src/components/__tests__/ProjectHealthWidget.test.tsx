import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../test-utils'
import { ProjectHealthWidget } from '../ProjectHealthWidget'

// Mock recharts since it uses SVG/DOM not available in jsdom
vi.mock('recharts', () => ({
  RadialBarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radial-chart">{children}</div>,
  RadialBar: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
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

// useProjectCache state controlled via module-level variables captured in the mock factory
let mockData: unknown = null
let mockIsFirstLoad = false

vi.mock('../../hooks/useProjectCache', () => ({
  useProjectCache: () => ({
    data: mockData,
    isFirstLoad: mockIsFirstLoad,
    refresh: vi.fn(),
  }),
}))

const mockMetrics = {
  coverage: {
    pct: 82.5,
    lines: 85.2,
    statements: 84.1,
    functions: 80.3,
    branches: 72.6,
    source: 'vitest',
  },
  healthScore: 75,
  healthFactors: {
    hasCoverage: true,
    coverageGood: true,
    pipelineHealthy: true,
    hasRecentActivity: true,
  },
  recentCommits: [
    { hash: 'abc1234', message: 'feat: add new feature', author: 'Dev', date: '2024-03-21' },
    { hash: 'def5678', message: 'fix: resolve bug', author: 'Dev', date: '2024-03-20' },
  ],
  pipeline: {
    lastJobId: 'job-1',
    lastJobStatus: 'completed',
    lastJobCommand: '/sr:implement',
    lastJobAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
  },
}

const mockMetricsNoCoverage = {
  coverage: {
    pct: null,
    lines: null,
    statements: null,
    functions: null,
    branches: null,
    source: null,
  },
  healthScore: 20,
  healthFactors: {
    hasCoverage: false,
    coverageGood: false,
    pipelineHealthy: false,
    hasRecentActivity: false,
  },
  recentCommits: [],
  pipeline: {
    lastJobId: null,
    lastJobStatus: null,
    lastJobCommand: null,
    lastJobAt: null,
  },
}

describe('ProjectHealthWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockData = null
    mockIsFirstLoad = false
  })

  it('renders loading skeleton when isFirstLoad is true', () => {
    mockIsFirstLoad = true
    const { container } = render(<ProjectHealthWidget />)
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('returns null when metrics is null and not loading', () => {
    mockData = null
    mockIsFirstLoad = false
    const { container } = render(<ProjectHealthWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders health content when metrics are available (heading now in CollapsibleSection)', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    // The "Project Health" heading was moved to CollapsibleSection
    // Verify health content renders (score, factors, etc.)
    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('health')).toBeInTheDocument()
  })

  it('renders health score gauge with score value', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('health')).toBeInTheDocument()
  })

  it('renders coverage factor rows', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Coverage available')).toBeInTheDocument()
    expect(screen.getByText('Coverage ≥ 70%')).toBeInTheDocument()
    expect(screen.getByText('Last pipeline green')).toBeInTheDocument()
    expect(screen.getByText('Active this week')).toBeInTheDocument()
  })

  it('renders coverage bars with line/function/branch labels', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Lines')).toBeInTheDocument()
    expect(screen.getByText('Functions')).toBeInTheDocument()
    expect(screen.getByText('Branches')).toBeInTheDocument()
  })

  it('renders coverage percentages', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('85.2%')).toBeInTheDocument()
    expect(screen.getByText('80.3%')).toBeInTheDocument()
    expect(screen.getByText('72.6%')).toBeInTheDocument()
  })

  it('renders "n/a" for null coverage values', () => {
    mockData = mockMetricsNoCoverage
    render(<ProjectHealthWidget />)
    const naLabels = screen.getAllByText('n/a')
    expect(naLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders pipeline status badge for completed status', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders "No jobs yet" when lastJobStatus is null', () => {
    mockData = mockMetricsNoCoverage
    render(<ProjectHealthWidget />)
    expect(screen.getByText('No jobs yet')).toBeInTheDocument()
  })

  it('renders last job command when available', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('/sr:implement')).toBeInTheDocument()
  })

  it('renders recent commits list', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('feat: add new feature')).toBeInTheDocument()
    expect(screen.getByText('fix: resolve bug')).toBeInTheDocument()
  })

  it('renders commit hashes', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('def5678')).toBeInTheDocument()
  })

  it('renders "No git history found" when commits array is empty', () => {
    mockData = mockMetricsNoCoverage
    render(<ProjectHealthWidget />)
    expect(screen.getByText('No git history found')).toBeInTheDocument()
  })

  it('renders Recent commits label', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Recent commits')).toBeInTheDocument()
  })

  it('renders timeAgo for lastJobAt when available', () => {
    mockData = mockMetrics
    render(<ProjectHealthWidget />)
    // 1 hour ago
    expect(screen.getByText('1h ago')).toBeInTheDocument()
  })

  it('renders failed status badge', () => {
    mockData = {
      ...mockMetrics,
      pipeline: { ...mockMetrics.pipeline, lastJobStatus: 'failed' },
    }
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders canceled status badge', () => {
    mockData = {
      ...mockMetrics,
      pipeline: { ...mockMetrics.pipeline, lastJobStatus: 'canceled' },
    }
    render(<ProjectHealthWidget />)
    expect(screen.getByText('Canceled')).toBeInTheDocument()
  })

  it('renders running status with Clock icon (unknown status falls through)', () => {
    mockData = {
      ...mockMetrics,
      pipeline: { ...mockMetrics.pipeline, lastJobStatus: 'running' },
    }
    render(<ProjectHealthWidget />)
    // 'running' is not in the map, falls to default which shows the status text
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('renders timeAgo returns days for old timestamps', () => {
    mockData = {
      ...mockMetrics,
      pipeline: {
        ...mockMetrics.pipeline,
        lastJobAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
    }
    render(<ProjectHealthWidget />)
    expect(screen.getByText('2d ago')).toBeInTheDocument()
  })
})
