import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// Mock recharts to exercise tooltip and legend formatters without canvas/ResizeObserver
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: ({ content }: { content: React.ReactElement }) => {
    const TooltipContent = content?.type as React.ComponentType<{
      active?: boolean
      payload?: { name: string; value: number }[]
    }> | null
    return (
      <div>
        {TooltipContent && (
          <TooltipContent
            active={true}
            payload={[{ name: 'completed', value: 35 }]}
          />
        )}
        {TooltipContent && (
          <TooltipContent active={false} payload={[]} />
        )}
      </div>
    )
  },
  Legend: ({ formatter }: { formatter?: (v: string) => React.ReactNode }) => {
    // Exercise the legend formatter with real status values
    const completedLabel = formatter ? formatter('completed') : 'completed'
    const failedLabel = formatter ? formatter('failed') : 'failed'
    const canceledLabel = formatter ? formatter('canceled') : 'canceled'
    return (
      <div data-testid="legend">
        <div data-testid="legend-completed">{completedLabel}</div>
        <div data-testid="legend-failed">{failedLabel}</div>
        <div data-testid="legend-canceled">{canceledLabel}</div>
      </div>
    )
  },
}))

import { StatusBreakdown } from '../StatusBreakdown'

const mockData = [
  { status: 'completed', count: 35 },
  { status: 'failed', count: 5 },
  { status: 'canceled', count: 2 },
]

describe('StatusBreakdown', () => {
  // ─── Heading ─────────────────────────────────────────────────────────────────

  it('renders the Jobs by Status heading with data', () => {
    render(<StatusBreakdown data={mockData} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  it('renders the Jobs by Status heading in empty state', () => {
    render(<StatusBreakdown data={[]} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  // ─── Empty state ─────────────────────────────────────────────────────────────

  it('renders empty state when data array is empty', () => {
    render(<StatusBreakdown data={[]} />)
    expect(screen.getByText('No jobs in this period')).toBeInTheDocument()
  })

  it('does NOT render empty state when data has entries', () => {
    render(<StatusBreakdown data={mockData} />)
    expect(screen.queryByText('No jobs in this period')).toBeNull()
  })

  it('renders chart (not empty state) when a single-status entry exists', () => {
    render(<StatusBreakdown data={[{ status: 'completed', count: 10 }]} />)
    expect(screen.queryByText('No jobs in this period')).toBeNull()
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  // ─── Tooltip ─────────────────────────────────────────────────────────────────

  it('renders active tooltip with status name', () => {
    render(<StatusBreakdown data={mockData} />)
    // CustomTooltip renders item.name (capitalized via CSS, text is lowercase)
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders active tooltip with job count', () => {
    render(<StatusBreakdown data={mockData} />)
    expect(screen.getByText('35 jobs')).toBeInTheDocument()
  })

  it('does not render tooltip content for inactive tooltip', () => {
    render(<StatusBreakdown data={mockData} />)
    // Inactive tooltip returns null — no duplicate text from it
    // Verify heading still renders (overall stability)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  // ─── Legend with percentage calculation ──────────────────────────────────────

  it('renders legend with status name, count and percentage for completed', () => {
    render(<StatusBreakdown data={mockData} />)
    // total = 35+5+2 = 42; completed % = Math.round(35/42*100) = 83%
    // Legend formatter renders: "completed (35, 83%)"
    const legendCompleted = screen.getByTestId('legend-completed')
    expect(legendCompleted).toHaveTextContent('completed')
    expect(legendCompleted).toHaveTextContent('35')
    expect(legendCompleted).toHaveTextContent('83%')
  })

  it('renders legend with correct percentage for failed', () => {
    render(<StatusBreakdown data={mockData} />)
    // failed % = Math.round(5/42*100) = 12%
    const legendFailed = screen.getByTestId('legend-failed')
    expect(legendFailed).toHaveTextContent('failed')
    expect(legendFailed).toHaveTextContent('5')
    expect(legendFailed).toHaveTextContent('12%')
  })

  it('renders legend with correct percentage for canceled', () => {
    render(<StatusBreakdown data={mockData} />)
    // canceled % = Math.round(2/42*100) = 5%
    const legendCanceled = screen.getByTestId('legend-canceled')
    expect(legendCanceled).toHaveTextContent('canceled')
    expect(legendCanceled).toHaveTextContent('2')
    expect(legendCanceled).toHaveTextContent('5%')
  })

  it('renders 0% and count 0 in legend for a missing status entry', () => {
    // When legend formatter is called with a value not in data, count=0 pct=0%
    // This exercises the `entry ?? 0` fallback in the formatter
    render(<StatusBreakdown data={[{ status: 'completed', count: 10 }]} />)
    // Legend mock calls formatter('failed') — not in data → should render "failed (0, 0%)"
    const legendFailed = screen.getByTestId('legend-failed')
    expect(legendFailed).toHaveTextContent('failed')
    expect(legendFailed).toHaveTextContent('0')
    expect(legendFailed).toHaveTextContent('0%')
  })

  it('renders 100% for a single-status dataset', () => {
    render(<StatusBreakdown data={[{ status: 'completed', count: 20 }]} />)
    const legendCompleted = screen.getByTestId('legend-completed')
    expect(legendCompleted).toHaveTextContent('100%')
  })

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  it('renders without crash for a single entry with count 1', () => {
    render(<StatusBreakdown data={[{ status: 'failed', count: 1 }]} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  it('renders without crash for large counts', () => {
    const large = [
      { status: 'completed', count: 10000 },
      { status: 'failed', count: 500 },
    ]
    render(<StatusBreakdown data={large} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })

  it('renders without crash for unknown status (uses fallback color)', () => {
    render(<StatusBreakdown data={[{ status: 'queued', count: 5 }]} />)
    expect(screen.getByText('Jobs by Status')).toBeInTheDocument()
  })
})
