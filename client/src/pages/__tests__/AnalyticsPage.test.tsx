import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import AnalyticsPage from '../AnalyticsPage'
import type { AnalyticsResponse } from '../../types'

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

// Mock all chart components to avoid recharts DOM issues
vi.mock('../../components/analytics/KpiCards', () => ({
  KpiCards: ({ kpi }: { kpi: AnalyticsResponse['kpi'] }) => (
    <div data-testid="kpi-cards">KPI: {kpi.totalJobs} jobs</div>
  ),
}))
vi.mock('../../components/analytics/CostTimeline', () => ({
  CostTimeline: () => <div data-testid="cost-timeline">CostTimeline</div>,
}))
vi.mock('../../components/analytics/StatusBreakdown', () => ({
  StatusBreakdown: () => <div data-testid="status-breakdown">StatusBreakdown</div>,
}))
vi.mock('../../components/analytics/DurationHistogram', () => ({
  DurationHistogram: () => <div data-testid="duration-histogram">DurationHistogram</div>,
}))
vi.mock('../../components/analytics/TokenEfficiency', () => ({
  TokenEfficiency: () => <div data-testid="token-efficiency">TokenEfficiency</div>,
}))
vi.mock('../../components/analytics/CommandPerformance', () => ({
  CommandPerformance: () => <div data-testid="command-performance">CommandPerformance</div>,
}))
vi.mock('../../components/analytics/DailyThroughput', () => ({
  DailyThroughput: () => <div data-testid="daily-throughput">DailyThroughput</div>,
}))
vi.mock('../../components/analytics/CostTreemap', () => ({
  CostTreemap: () => <div data-testid="cost-treemap">CostTreemap</div>,
}))
vi.mock('../../components/analytics/BonusMetrics', () => ({
  BonusMetrics: () => <div data-testid="bonus-metrics">BonusMetrics</div>,
}))
vi.mock('../../components/analytics/PeriodSelector', () => ({
  PeriodSelector: ({ period, onChange }: { period: string; onChange: (p: string) => void }) => (
    <div data-testid="period-selector">
      <button onClick={() => onChange('30d')}>30d</button>
      <button onClick={() => onChange('7d')}>7d</button>
      <span data-testid="current-period">{period}</span>
    </div>
  ),
}))

const mockAnalyticsData: AnalyticsResponse = {
  period: { label: 'Last 7 days', from: null, to: null },
  kpi: {
    totalCostUsd: 1.5,
    totalJobs: 10,
    successRate: 0.9,
    avgDurationMs: 5000,
    costDelta: null,
    jobsDelta: null,
    successRateDelta: null,
    avgDurationDelta: null,
  },
  costTimeline: [],
  statusBreakdown: [],
  durationHistogram: [],
  durationPercentiles: { p50: null, p75: null, p95: null },
  tokenEfficiency: [],
  commandPerformance: [],
  dailyThroughput: [],
  costPerCommand: [],
  bonusMetrics: {
    costPerSuccess: null,
    apiEfficiencyPct: null,
    failureCostUsd: 0,
    modelBreakdown: [],
  },
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton initially', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
    const { container } = render(<AnalyticsPage />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders Analytics heading', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<AnalyticsPage />)
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })

  it('fetches analytics data on mount', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalyticsData,
    })
    render(<AnalyticsPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.any(Object)
      )
    })
  })

  it('renders charts when data is loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalyticsData,
    })
    render(<AnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
    })
    expect(screen.getByTestId('cost-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('status-breakdown')).toBeInTheDocument()
  })

  it('shows error state with retry button when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
    render(<AnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to load analytics/i)).toBeInTheDocument()
  })

  it('retry button triggers re-fetch', async () => {
    const user = userEvent.setup()
    // First call fails, second succeeds
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, json: async () => mockAnalyticsData })

    render(<AnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => {
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
    })
  })

  it('shows period label when data is loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalyticsData,
    })
    render(<AnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByText('Last 7 days')).toBeInTheDocument()
    })
  })

  it('period selector is rendered', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<AnalyticsPage />)
    expect(screen.getByTestId('period-selector')).toBeInTheDocument()
  })
})
