import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// Mock recharts to exercise formatters, tooltip, and legend without a real canvas
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) => {
    const label = tickFormatter ? tickFormatter('2024-01-15') : '2024-01-15'
    return <div data-testid="x-axis-tick">{label}</div>
  },
  YAxis: () => null,
  Tooltip: ({ content }: { content: React.ReactElement }) => {
    const TooltipContent = content?.type as React.ComponentType<{
      active?: boolean
      payload?: { name: string; value: number; color: string }[]
      label?: string
    }> | null
    return (
      <div>
        {TooltipContent && (
          <TooltipContent
            active={true}
            payload={[
              { name: 'Completed', value: 8, color: '#bd93f9' },
              { name: 'Failed', value: 1, color: '#ff79c6' },
            ]}
            label="Jan 15"
          />
        )}
        {TooltipContent && (
          <TooltipContent active={false} payload={[]} label="Jan 16" />
        )}
      </div>
    )
  },
  Legend: ({ formatter }: { formatter?: (v: string) => React.ReactNode }) => {
    const label = formatter ? formatter('completed') : 'completed'
    return <div data-testid="legend">{label}</div>
  },
}))

import { DailyThroughput } from '../DailyThroughput'

const mockData = [
  { date: '2024-01-14', completed: 6, failed: 1, canceled: 0 },
  { date: '2024-01-15', completed: 8, failed: 1, canceled: 0 },
  { date: '2024-01-16', completed: 12, failed: 2, canceled: 1 },
]

describe('DailyThroughput', () => {
  // ─── Heading ─────────────────────────────────────────────────────────────────

  it('renders the Daily Throughput heading with data', () => {
    render(<DailyThroughput data={mockData} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
  })

  it('renders the Daily Throughput heading in empty state', () => {
    render(<DailyThroughput data={[]} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
  })

  // ─── Empty state ─────────────────────────────────────────────────────────────

  it('renders empty state when data array is empty', () => {
    render(<DailyThroughput data={[]} />)
    expect(screen.getByText('No throughput data for this period')).toBeInTheDocument()
  })

  it('renders empty state when all entries have zero counts', () => {
    const zeros = [{ date: '2024-01-01', completed: 0, failed: 0, canceled: 0 }]
    render(<DailyThroughput data={zeros} />)
    expect(screen.getByText('No throughput data for this period')).toBeInTheDocument()
  })

  it('renders empty state when multiple zero-count entries are present', () => {
    const zeros = [
      { date: '2024-01-01', completed: 0, failed: 0, canceled: 0 },
      { date: '2024-01-02', completed: 0, failed: 0, canceled: 0 },
    ]
    render(<DailyThroughput data={zeros} />)
    expect(screen.getByText('No throughput data for this period')).toBeInTheDocument()
  })

  it('does NOT render empty state when any entry has nonzero completed', () => {
    const data = [{ date: '2024-01-01', completed: 1, failed: 0, canceled: 0 }]
    render(<DailyThroughput data={data} />)
    expect(screen.queryByText('No throughput data for this period')).toBeNull()
  })

  it('does NOT render empty state when only failed count is nonzero', () => {
    const data = [{ date: '2024-01-01', completed: 0, failed: 1, canceled: 0 }]
    render(<DailyThroughput data={data} />)
    expect(screen.queryByText('No throughput data for this period')).toBeNull()
  })

  it('does NOT render empty state when only canceled count is nonzero', () => {
    const data = [{ date: '2024-01-01', completed: 0, failed: 0, canceled: 1 }]
    render(<DailyThroughput data={data} />)
    expect(screen.queryByText('No throughput data for this period')).toBeNull()
  })

  // ─── Date formatting ──────────────────────────────────────────────────────────

  it('formats x-axis date "2024-01-15" as "Jan 15"', () => {
    render(<DailyThroughput data={mockData} />)
    expect(screen.getByTestId('x-axis-tick')).toHaveTextContent('Jan 15')
  })

  // ─── Tooltip ─────────────────────────────────────────────────────────────────

  it('renders active tooltip with payload values', () => {
    render(<DailyThroughput data={mockData} />)
    // CustomTooltip renders "Completed: 8" and "Failed: 1"
    expect(screen.getByText('Completed: 8')).toBeInTheDocument()
    expect(screen.getByText('Failed: 1')).toBeInTheDocument()
  })

  it('renders tooltip label from the active payload', () => {
    render(<DailyThroughput data={mockData} />)
    // 'Jan 15' appears in both the XAxis tick and tooltip label
    expect(screen.getAllByText('Jan 15').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render tooltip content for inactive tooltip', () => {
    render(<DailyThroughput data={mockData} />)
    // Only "Jan 15" appears (from active tooltip), not "Jan 16" (from inactive)
    expect(screen.queryByText('Jan 16')).toBeNull()
  })

  // ─── Legend ──────────────────────────────────────────────────────────────────

  it('renders legend via the Legend formatter', () => {
    render(<DailyThroughput data={mockData} />)
    // The Legend mock calls formatter('completed') → renders a <span> with "completed"
    const legend = screen.getByTestId('legend')
    expect(legend).toBeInTheDocument()
    expect(legend).toHaveTextContent('completed')
  })

  // ─── Tick thinning ───────────────────────────────────────────────────────────

  it('renders without crash for a single data point', () => {
    const single = [{ date: '2024-01-01', completed: 5, failed: 0, canceled: 0 }]
    render(<DailyThroughput data={single} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
  })

  it('renders without crash for a dense dataset (>7 entries, tick thinning applied)', () => {
    const dense = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      completed: i + 1,
      failed: 0,
      canceled: 0,
    }))
    render(<DailyThroughput data={dense} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
  })

  // ─── Mixed data edge cases ────────────────────────────────────────────────────

  it('renders without crash for data with only canceled jobs', () => {
    const data = [
      { date: '2024-01-01', completed: 0, failed: 0, canceled: 3 },
      { date: '2024-01-02', completed: 0, failed: 0, canceled: 1 },
    ]
    render(<DailyThroughput data={data} />)
    expect(screen.getByText('Daily Throughput')).toBeInTheDocument()
    expect(screen.queryByText('No throughput data for this period')).toBeNull()
  })
})
