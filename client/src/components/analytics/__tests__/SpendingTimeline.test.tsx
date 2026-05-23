import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../../test-utils'
import { SpendingTimeline } from '../SpendingTimeline'
import type { SpendingResponse } from '../../../types/spending'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
}))

function emptyData(daily: SpendingResponse['dailyTimeline'] = []): SpendingResponse {
  return {
    summary: { totalCostUsd: 0, totalRuns: 0, failureRate: 0, prevTotalCostUsd: 0, deltaPct: null, avgCostPerRun: null },
    bySurface: [], byModel: [], byMode: [], dailyTimeline: daily, scatter: [], topTickets: [],
    trackingStartedAt: null, rangeFrom: '', rangeTo: '',
  }
}

describe('SpendingTimeline', () => {
  it('renders skeleton when loading without data', () => {
    const { container } = render(<SpendingTimeline data={null} loading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('returns null when no data and not loading', () => {
    const { container } = render(<SpendingTimeline data={null} loading={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders empty state when timeline has all zeros', () => {
    const data = emptyData([
      { date: '2026-05-01', jobsCostUsd: 0, quickCostUsd: 0, exploreCostUsd: 0, aiEditCostUsd: 0, totalCostUsd: 0 },
    ])
    render(<SpendingTimeline data={data} loading={false} />)
    expect(screen.getByText(/No spend in this period/i)).toBeInTheDocument()
  })

  it('renders chart when daily totals contain spend', () => {
    const data = emptyData([
      { date: '2026-05-01', jobsCostUsd: 5, quickCostUsd: 0, exploreCostUsd: 0, aiEditCostUsd: 0, totalCostUsd: 5 },
      { date: '2026-05-02', jobsCostUsd: 0, quickCostUsd: 1, exploreCostUsd: 2, aiEditCostUsd: 0.5, totalCostUsd: 3.5 },
    ])
    render(<SpendingTimeline data={data} loading={false} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.getAllByTestId('bar').length).toBe(5)
  })
})
