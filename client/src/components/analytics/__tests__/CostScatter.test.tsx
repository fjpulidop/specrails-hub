import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../../test-utils'
import { CostScatter } from '../CostScatter'
import type { SpendingResponse } from '../../../types/spending'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: ({ data }: { data: unknown[] }) => <div data-testid={`scatter-set-${data.length}`} />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ZAxis: () => <div />,
}))

function emptyData(scatter: SpendingResponse['scatter'] = []): SpendingResponse {
  return {
    summary: { totalCostUsd: 0, totalRuns: 0, failureRate: 0, prevTotalCostUsd: 0, deltaPct: null, avgCostPerRun: null },
    bySurface: [], byModel: [], byMode: [], dailyTimeline: [], scatter, topTickets: [],
    trackingStartedAt: null, rangeFrom: '', rangeTo: '',
  }
}

describe('CostScatter', () => {
  it('renders skeleton when loading without data', () => {
    const { container } = render(<CostScatter data={null} loading onSelectPoint={() => {}} />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('returns null when no data', () => {
    const { container } = render(<CostScatter data={null} loading={false} onSelectPoint={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders empty state when no scatter points', () => {
    render(<CostScatter data={emptyData([])} loading={false} onSelectPoint={() => {}} />)
    expect(screen.getByText(/No invocations to plot/i)).toBeInTheDocument()
  })

  it('groups points by surface and renders one Scatter per surface', () => {
    const scatter: SpendingResponse['scatter'] = [
      { id: '1', surface: 'job', costUsd: 1, numTurns: 3, durationMs: 1000, ticketId: null, startedAt: '2026-05-06T00:00:00Z' },
      { id: '2', surface: 'job', costUsd: 2, numTurns: 4, durationMs: 1500, ticketId: 7, startedAt: '2026-05-06T00:00:00Z' },
      { id: '3', surface: 'explore-spec', costUsd: 0.5, numTurns: null, durationMs: 5000, ticketId: 7, startedAt: '2026-05-06T00:00:00Z' },
    ]
    render(<CostScatter data={emptyData(scatter)} loading={false} onSelectPoint={() => {}} />)
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument()
    expect(screen.getByTestId('scatter-set-2')).toBeInTheDocument() // 2 jobs
    expect(screen.getByTestId('scatter-set-1')).toBeInTheDocument() // 1 explore
  })
})
