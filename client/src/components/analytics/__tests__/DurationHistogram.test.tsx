import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// Mock recharts to avoid canvas/ResizeObserver complexity in jsdom.
// The Tooltip mock exercises CustomTooltip so its render path is covered.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    // recharts ResponsiveContainer passes (width, height) to function children
    typeof children === 'function' ? (
      <div data-testid="responsive-container">{children(400, 300)}</div>
    ) : (
      <div data-testid="responsive-container">{children}</div>
    ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({
    content,
  }: {
    content: React.ReactElement<{
      active?: boolean
      payload?: { value: number }[]
      label?: string
    }>
  }) => {
    // Render the CustomTooltip with active=true so its content path is hit
    const TooltipContent = content?.type as React.ComponentType<{
      active?: boolean
      payload?: { value: number }[]
      label?: string
    }> | null
    if (!TooltipContent) return null
    return (
      <div data-testid="tooltip-wrapper">
        {/* active case */}
        <TooltipContent active={true} payload={[{ value: 7 }]} label="1-3m" />
        {/* inactive case — should render null */}
        <TooltipContent active={false} payload={[]} label="3-5m" />
      </div>
    )
  },
}))

import { DurationHistogram } from '../DurationHistogram'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fullData = [
  { bucket: '<1m', count: 10 },
  { bucket: '1-3m', count: 20 },
  { bucket: '3-5m', count: 8 },
  { bucket: '5-10m', count: 3 },
  { bucket: '>10m', count: 1 },
]

const allZeroData = fullData.map((d) => ({ ...d, count: 0 }))

const fullPercentiles = { p50: 90000, p75: 180000, p95: 360000 }
const nullPercentiles = { p50: null, p75: null, p95: null }

// ─── Render without crash ──────────────────────────────────────────────────────

describe('DurationHistogram — render', () => {
  it('renders without crashing with data', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText('Duration Distribution')).toBeInTheDocument()
  })

  it('renders section heading with data', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText('Duration Distribution')).toBeInTheDocument()
  })

  it('renders section heading in empty state', () => {
    render(<DurationHistogram data={[]} percentiles={fullPercentiles} />)
    expect(screen.getByText('Duration Distribution')).toBeInTheDocument()
  })
})

// ─── Empty state ───────────────────────────────────────────────────────────────

describe('DurationHistogram — empty state', () => {
  it('shows empty-state message when data array is empty', () => {
    render(<DurationHistogram data={[]} percentiles={fullPercentiles} />)
    expect(screen.getByText('No duration data available')).toBeInTheDocument()
  })

  it('shows empty-state message when all bucket counts are zero', () => {
    render(<DurationHistogram data={allZeroData} percentiles={fullPercentiles} />)
    expect(screen.getByText('No duration data available')).toBeInTheDocument()
  })

  it('does not show the chart in empty state', () => {
    render(<DurationHistogram data={[]} percentiles={fullPercentiles} />)
    expect(screen.queryByTestId('bar-chart')).toBeNull()
  })

  it('does not show percentile labels in empty state', () => {
    render(<DurationHistogram data={[]} percentiles={fullPercentiles} />)
    expect(screen.queryByText(/p50/i)).toBeNull()
    expect(screen.queryByText(/p75/i)).toBeNull()
    expect(screen.queryByText(/p95/i)).toBeNull()
  })

  it('shows empty state when only some buckets are zero (all must be zero)', () => {
    // Only one bucket with non-zero count — should NOT be empty
    const partialData = [
      { bucket: '<1m', count: 0 },
      { bucket: '1-3m', count: 5 },
    ]
    render(<DurationHistogram data={partialData} percentiles={fullPercentiles} />)
    expect(screen.queryByText('No duration data available')).toBeNull()
  })
})

// ─── Chart renders with data ───────────────────────────────────────────────────

describe('DurationHistogram — chart with data', () => {
  it('renders the bar chart when data has non-zero counts', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders the responsive container when data is present', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })
})

// ─── Bucket ordering ──────────────────────────────────────────────────────────

describe('DurationHistogram — bucket ordering', () => {
  it('normalises data to the fixed BUCKET_ORDER regardless of input order', () => {
    // Input in reverse order — component should still render all 5 buckets
    const reversed = [
      { bucket: '>10m', count: 1 },
      { bucket: '5-10m', count: 3 },
      { bucket: '3-5m', count: 8 },
      { bucket: '1-3m', count: 20 },
      { bucket: '<1m', count: 10 },
    ]
    render(<DurationHistogram data={reversed} percentiles={fullPercentiles} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('fills missing buckets with count 0 (no crash for partial data)', () => {
    const partial = [{ bucket: '1-3m', count: 5 }]
    render(<DurationHistogram data={partial} percentiles={fullPercentiles} />)
    // Has data — chart should render
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('handles unknown bucket names gracefully (count defaults to 0)', () => {
    const unknownBucket = [{ bucket: 'unknown', count: 99 }]
    render(<DurationHistogram data={unknownBucket} percentiles={fullPercentiles} />)
    // All 5 known buckets will have count 0 → empty state
    expect(screen.getByText('No duration data available')).toBeInTheDocument()
  })
})

// ─── Percentile display ────────────────────────────────────────────────────────

describe('DurationHistogram — percentile display', () => {
  it('renders p50 label', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText(/p50/i)).toBeInTheDocument()
  })

  it('renders p75 label', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText(/p75/i)).toBeInTheDocument()
  })

  it('renders p95 label', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText(/p95/i)).toBeInTheDocument()
  })

  it('renders formatted p50 value (90000ms → "1m 30s")', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('renders formatted p75 value (180000ms → "3m 0s")', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText('3m 0s')).toBeInTheDocument()
  })

  it('renders formatted p95 value (360000ms → "6m 0s")', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    expect(screen.getByText('6m 0s')).toBeInTheDocument()
  })

  it('renders "—" for null p50', () => {
    render(<DurationHistogram data={fullData} percentiles={nullPercentiles} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  it('renders "—" for null p75', () => {
    render(<DurationHistogram data={fullData} percentiles={{ p50: 90000, p75: null, p95: 360000 }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('renders "—" for null p95', () => {
    render(<DurationHistogram data={fullData} percentiles={{ p50: 90000, p75: 180000, p95: null }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('renders percentile values for sub-minute durations (< 60s)', () => {
    render(<DurationHistogram data={fullData} percentiles={{ p50: 45000, p75: 55000, p95: 59000 }} />)
    expect(screen.getByText('45s')).toBeInTheDocument()
    expect(screen.getByText('55s')).toBeInTheDocument()
    expect(screen.getByText('59s')).toBeInTheDocument()
  })

  it('renders percentile value of 0ms as "0s"', () => {
    render(<DurationHistogram data={fullData} percentiles={{ p50: 0, p75: 0, p95: 0 }} />)
    const zeroSecs = screen.getAllByText('0s')
    expect(zeroSecs.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── CustomTooltip via recharts mock ─────────────────────────────────────────

describe('DurationHistogram — CustomTooltip', () => {
  it('renders tooltip content when active=true (shows job count)', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    // The Tooltip mock renders CustomTooltip with active=true, payload=[{value:7}], label="1-3m"
    expect(screen.getByText('7 jobs')).toBeInTheDocument()
    expect(screen.getByText('1-3m')).toBeInTheDocument()
  })

  it('does not render tooltip content when active=false', () => {
    render(<DurationHistogram data={fullData} percentiles={fullPercentiles} />)
    // The inactive tooltip (label="3-5m") renders null — "3-5m" should not appear as tooltip text
    // It also won't appear in XAxis labels since XAxis is mocked to null
    const matches = screen.queryAllByText('3-5m')
    // If it appears at all, it came from the tooltip wrapper div — the inactive branch returns null
    // so we should see 0 occurrences from the tooltip
    expect(matches.length).toBe(0)
  })
})
