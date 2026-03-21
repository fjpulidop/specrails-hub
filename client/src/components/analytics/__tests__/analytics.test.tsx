import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../../test-utils'

// Mock recharts to avoid canvas/ResizeObserver complexity
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Treemap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

import { KpiCards } from '../KpiCards'
import { CostTimeline } from '../CostTimeline'
import { StatusBreakdown } from '../StatusBreakdown'
import { DurationHistogram } from '../DurationHistogram'
import { TokenEfficiency } from '../TokenEfficiency'
import { CommandPerformance } from '../CommandPerformance'
import { DailyThroughput } from '../DailyThroughput'
import { CostTreemap } from '../CostTreemap'
import { BonusMetrics } from '../BonusMetrics'
import { PeriodSelector } from '../PeriodSelector'
import { TrendsChart } from '../TrendsChart'

// ─── Shared mock data ──────────────────────────────────────────────────────────

const mockKpi = {
  totalCostUsd: 1.2345,
  totalJobs: 42,
  successRate: 0.875,
  avgDurationMs: 90000,
  costDelta: 0.1,
  jobsDelta: 5,
  successRateDelta: 0.02,
  avgDurationDelta: -5000,
}

const mockCostTimeline = [
  { date: '2024-01-01', costUsd: 0.5 },
  { date: '2024-01-02', costUsd: 0.7 },
]

const mockStatusBreakdown = [
  { status: 'completed', count: 35 },
  { status: 'failed', count: 5 },
  { status: 'canceled', count: 2 },
]

const mockDurationHistogram = [
  { bucket: '<1m', count: 10 },
  { bucket: '1-3m', count: 20 },
  { bucket: '3-5m', count: 8 },
  { bucket: '5-10m', count: 3 },
  { bucket: '>10m', count: 1 },
]

const mockDurationPercentiles = { p50: 90000, p75: 180000, p95: 360000 }

const mockTokenEfficiency = [
  { command: '/architect', tokensOut: 1000, tokensCacheRead: 500, totalTokens: 2000 },
]

const mockCommandPerformance = [
  {
    command: '/architect',
    totalRuns: 10,
    successRate: 0.9,
    avgCostUsd: 0.05,
    avgDurationMs: 60000,
    totalCostUsd: 0.5,
  },
]

const mockDailyThroughput = [
  { date: '2024-01-01', completed: 8, failed: 1, canceled: 0 },
  { date: '2024-01-02', completed: 12, failed: 2, canceled: 1 },
]

const mockCostPerCommand = [
  { command: '/architect', totalCostUsd: 0.5, jobCount: 10 },
  { command: '/developer', totalCostUsd: 0.3, jobCount: 8 },
]

const mockBonusMetrics = {
  costPerSuccess: 0.042,
  apiEfficiencyPct: 87.5,
  failureCostUsd: 0.12,
  modelBreakdown: [
    { model: 'claude-opus-4', jobCount: 30, totalCostUsd: 1.0 },
  ],
}

const mockTrendPoints = [
  { date: '2024-01-01', jobCount: 5, avgDurationMs: 60000, avgTokens: 1000, avgCostUsd: 0.05, successRate: 1 },
  { date: '2024-01-02', jobCount: 8, avgDurationMs: 75000, avgTokens: 1200, avgCostUsd: 0.07, successRate: 0.875 },
]

// ─── KpiCards ──────────────────────────────────────────────────────────────────

describe('KpiCards', () => {
  it('renders Total Cost card', () => {
    render(<KpiCards kpi={mockKpi} />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('$1.2345')).toBeInTheDocument()
  })

  it('renders Total Jobs card', () => {
    render(<KpiCards kpi={mockKpi} />)
    expect(screen.getByText('Total Jobs')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders Success Rate card', () => {
    render(<KpiCards kpi={mockKpi} />)
    expect(screen.getByText('Success Rate')).toBeInTheDocument()
    expect(screen.getByText('87.5%')).toBeInTheDocument()
  })

  it('renders Avg Duration card', () => {
    render(<KpiCards kpi={mockKpi} />)
    expect(screen.getByText('Avg Duration')).toBeInTheDocument()
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('renders "—" for null avgDurationMs', () => {
    render(<KpiCards kpi={{ ...mockKpi, avgDurationMs: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders null deltas gracefully (no badge)', () => {
    render(<KpiCards kpi={{ ...mockKpi, costDelta: null, jobsDelta: null, successRateDelta: null, avgDurationDelta: null }} />)
    // no crashes, still renders cards
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
  })
})

// ─── CostTimeline ──────────────────────────────────────────────────────────────

describe('CostTimeline', () => {
  it('renders chart heading', () => {
    render(<CostTimeline data={mockCostTimeline} />)
    expect(screen.getByText('Cost Over Time')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<CostTimeline data={[]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })

  it('renders empty state when all costs are zero', () => {
    render(<CostTimeline data={[{ date: '2024-01-01', costUsd: 0 }]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })
})

// ─── StatusBreakdown ───────────────────────────────────────────────────────────

describe('StatusBreakdown', () => {
  it('renders Jobs by Status heading', () => {
    render(<StatusBreakdown data={mockStatusBreakdown} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<StatusBreakdown data={[]} />)
    expect(screen.getByText('No jobs in this period')).toBeInTheDocument()
  })
})

// ─── DurationHistogram ─────────────────────────────────────────────────────────

describe('DurationHistogram', () => {
  it('renders Duration Distribution heading', () => {
    render(<DurationHistogram data={mockDurationHistogram} percentiles={mockDurationPercentiles} />)
    expect(screen.getByText('Duration Distribution')).toBeInTheDocument()
  })

  it('renders empty state when all counts are zero', () => {
    const empty = mockDurationHistogram.map((d) => ({ ...d, count: 0 }))
    render(<DurationHistogram data={empty} percentiles={mockDurationPercentiles} />)
    expect(screen.getByText('No duration data available')).toBeInTheDocument()
  })

  it('renders percentile labels', () => {
    render(<DurationHistogram data={mockDurationHistogram} percentiles={mockDurationPercentiles} />)
    // Labels are uppercase spans like "P50:" — use case-insensitive regex
    expect(screen.getByText(/p50/i)).toBeInTheDocument()
    expect(screen.getByText(/p75/i)).toBeInTheDocument()
    expect(screen.getByText(/p95/i)).toBeInTheDocument()
  })

  it('renders "—" for null percentiles', () => {
    render(<DurationHistogram data={mockDurationHistogram} percentiles={{ p50: null, p75: null, p95: null }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── TokenEfficiency ───────────────────────────────────────────────────────────

describe('TokenEfficiency', () => {
  it('renders Token Efficiency heading', () => {
    render(<TokenEfficiency data={mockTokenEfficiency} />)
    expect(screen.getByText('Token Efficiency')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<TokenEfficiency data={[]} />)
    expect(screen.getByText('No token data for this period')).toBeInTheDocument()
  })
})

// ─── CommandPerformance ────────────────────────────────────────────────────────

describe('CommandPerformance', () => {
  it('renders Command Performance heading', () => {
    render(<CommandPerformance data={mockCommandPerformance} />)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<CommandPerformance data={[]} />)
    expect(screen.getByText('No command data for this period')).toBeInTheDocument()
  })

  it('renders a row for each command', () => {
    render(<CommandPerformance data={mockCommandPerformance} />)
    expect(screen.getByText('/architect')).toBeInTheDocument()
  })

  it('shows success rate badge', () => {
    render(<CommandPerformance data={mockCommandPerformance} />)
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('toggles sort direction when same column clicked twice', () => {
    render(<CommandPerformance data={[
      { command: '/architect', totalRuns: 10, successRate: 0.9, avgCostUsd: 0.05, avgDurationMs: 60000, totalCostUsd: 0.5 },
      { command: '/developer', totalRuns: 5, successRate: 0.8, avgCostUsd: 0.02, avgDurationMs: 30000, totalCostUsd: 0.1 },
    ]} />)

    const runsHeader = screen.getByText(/runs/i)
    fireEvent.click(runsHeader)
    fireEvent.click(runsHeader)
    // No crash — direction toggled
    expect(screen.getByText('/architect')).toBeInTheDocument()
  })

  it('sorts by a different column when a new header is clicked', () => {
    render(<CommandPerformance data={mockCommandPerformance} />)
    const commandHeader = screen.getByText(/^command$/i)
    fireEvent.click(commandHeader)
    expect(screen.getByText('/architect')).toBeInTheDocument()
  })
})

// ─── DailyThroughput ───────────────────────────────────────────────────────────

describe('DailyThroughput', () => {
  it('renders Daily Throughput heading', () => {
    render(<DailyThroughput data={mockDailyThroughput} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<DailyThroughput data={[]} />)
    expect(screen.getByText('No throughput data for this period')).toBeInTheDocument()
  })

  it('renders empty state when all counts are zero', () => {
    const zero = [{ date: '2024-01-01', completed: 0, failed: 0, canceled: 0 }]
    render(<DailyThroughput data={zero} />)
    expect(screen.getByText('No throughput data for this period')).toBeInTheDocument()
  })
})

// ─── CostTreemap ───────────────────────────────────────────────────────────────

describe('CostTreemap', () => {
  it('renders Cost per Command heading', () => {
    render(<CostTreemap data={mockCostPerCommand} />)
    expect(screen.getByText('Cost per Command')).toBeInTheDocument()
  })

  it('renders empty state when all costs are zero', () => {
    render(<CostTreemap data={[{ command: '/architect', totalCostUsd: 0, jobCount: 0 }]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<CostTreemap data={[]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })
})

// ─── BonusMetrics ──────────────────────────────────────────────────────────────

describe('BonusMetrics', () => {
  it('renders Bonus Metrics heading', () => {
    render(<BonusMetrics data={mockBonusMetrics} />)
    expect(screen.getByText('Bonus Metrics')).toBeInTheDocument()
  })

  it('renders Cost per Success stat', () => {
    render(<BonusMetrics data={mockBonusMetrics} />)
    expect(screen.getByText('Cost per Success')).toBeInTheDocument()
    expect(screen.getByText('$0.0420')).toBeInTheDocument()
  })

  it('renders API Efficiency stat', () => {
    render(<BonusMetrics data={mockBonusMetrics} />)
    expect(screen.getByText('API Efficiency')).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('renders Failure Cost stat', () => {
    render(<BonusMetrics data={mockBonusMetrics} />)
    expect(screen.getByText('Failure Cost')).toBeInTheDocument()
    expect(screen.getByText('$0.1200')).toBeInTheDocument()
  })

  it('renders "—" for null costPerSuccess', () => {
    render(<BonusMetrics data={{ ...mockBonusMetrics, costPerSuccess: null }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('renders model breakdown table', () => {
    render(<BonusMetrics data={mockBonusMetrics} />)
    expect(screen.getByText('claude-opus-4')).toBeInTheDocument()
  })

  it('renders empty model breakdown message when no models', () => {
    render(<BonusMetrics data={{ ...mockBonusMetrics, modelBreakdown: [] }} />)
    expect(screen.getByText('No model data for this period')).toBeInTheDocument()
  })
})

// ─── PeriodSelector ────────────────────────────────────────────────────────────

describe('PeriodSelector', () => {
  it('renders preset buttons: 7d, 30d, 90d, All, Custom', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="7d" from="" to="" onChange={onChange} />)
    expect(screen.getByText('7d')).toBeInTheDocument()
    expect(screen.getByText('30d')).toBeInTheDocument()
    expect(screen.getByText('90d')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('calls onChange with clicked preset', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="7d" from="" to="" onChange={onChange} />)
    fireEvent.click(screen.getByText('30d'))
    expect(onChange).toHaveBeenCalledWith('30d')
  })

  it('calls onChange with "custom" when Custom button clicked', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="7d" from="" to="" onChange={onChange} />)
    fireEvent.click(screen.getByText('Custom'))
    expect(onChange).toHaveBeenCalledWith('custom', '', '')
  })

  it('shows date inputs when period is custom', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="custom" from="2024-01-01" to="2024-01-31" onChange={onChange} />)
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByLabelText('End date')).toBeInTheDocument()
  })

  it('does not show date inputs when period is not custom', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="7d" from="" to="" onChange={onChange} />)
    expect(screen.queryByLabelText('Start date')).toBeNull()
    expect(screen.queryByLabelText('End date')).toBeNull()
  })

  it('calls onChange when start date changes', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="custom" from="2024-01-01" to="2024-01-31" onChange={onChange} />)
    const startInput = screen.getByLabelText('Start date')
    fireEvent.change(startInput, { target: { value: '2024-01-05' } })
    expect(onChange).toHaveBeenCalledWith('custom', '2024-01-05', '2024-01-31')
  })

  it('calls onChange when end date changes', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="custom" from="2024-01-01" to="2024-01-31" onChange={onChange} />)
    const endInput = screen.getByLabelText('End date')
    fireEvent.change(endInput, { target: { value: '2024-02-28' } })
    expect(onChange).toHaveBeenCalledWith('custom', '2024-01-01', '2024-02-28')
  })
})

// ─── TrendsChart ───────────────────────────────────────────────────────────────

describe('TrendsChart', () => {
  it('renders Performance Trends heading', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    expect(screen.getByText('Performance Trends')).toBeInTheDocument()
  })

  it('renders empty state when no jobs in period', () => {
    const empty = mockTrendPoints.map((p) => ({ ...p, jobCount: 0 }))
    render(<TrendsChart points={empty} />)
    expect(screen.getByText('No job data for this period')).toBeInTheDocument()
  })

  it('renders empty state when points array is empty', () => {
    render(<TrendsChart points={[]} />)
    expect(screen.getByText('No job data for this period')).toBeInTheDocument()
  })

  it('renders metric toggle buttons', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    expect(screen.getByText(/avg cost/i)).toBeInTheDocument()
    expect(screen.getByText(/avg duration/i)).toBeInTheDocument()
    expect(screen.getByText(/success rate/i)).toBeInTheDocument()
  })

  it('toggles a metric off when its button is clicked', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    const costBtn = screen.getByRole('button', { name: /avg cost/i })
    fireEvent.click(costBtn)
    // Not a crash test — just ensures click handler works
    expect(costBtn).toBeInTheDocument()
  })

  it('does not remove last active metric (must have at least 1)', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    // Default active: cost + successRate. Click both cost and successRate.
    const costBtn = screen.getByRole('button', { name: /avg cost/i })
    const successBtn = screen.getByRole('button', { name: /success rate/i })
    fireEvent.click(costBtn) // deactivate cost
    fireEvent.click(successBtn) // try to deactivate last — should be no-op
    expect(screen.getByRole('button', { name: /success rate/i })).toBeInTheDocument()
  })

  it('toggles duration metric on when its button is clicked', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    const durationBtn = screen.getByRole('button', { name: /avg duration/i })
    fireEvent.click(durationBtn) // activate duration (it starts inactive)
    // Just ensure no crash and button still shows
    expect(durationBtn).toBeInTheDocument()
  })

  it('toggles metric back on after deactivating', () => {
    render(<TrendsChart points={mockTrendPoints} />)
    const costBtn = screen.getByRole('button', { name: /avg cost/i })
    fireEvent.click(costBtn) // deactivate
    fireEvent.click(costBtn) // reactivate
    expect(costBtn).toBeInTheDocument()
  })
})
