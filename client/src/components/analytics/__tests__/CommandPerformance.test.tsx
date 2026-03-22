import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// CommandPerformance has no recharts dependency — no mock needed

import { CommandPerformance } from '../CommandPerformance'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const singleRow = [
  {
    command: '/architect',
    totalRuns: 10,
    successRate: 0.9,
    avgCostUsd: 0.05,
    avgDurationMs: 60000,
    totalCostUsd: 0.5,
  },
]

const multiRow = [
  {
    command: '/architect',
    totalRuns: 10,
    successRate: 0.9,
    avgCostUsd: 0.05,
    avgDurationMs: 60000,
    totalCostUsd: 0.5,
  },
  {
    command: '/developer',
    totalRuns: 5,
    successRate: 0.6,
    avgCostUsd: 0.02,
    avgDurationMs: 30000,
    totalCostUsd: 0.1,
  },
  {
    command: '/reviewer',
    totalRuns: 3,
    successRate: 0.33,
    avgCostUsd: null,
    avgDurationMs: null,
    totalCostUsd: 0.0,
  },
]

// ─── Render without crash ──────────────────────────────────────────────────────

describe('CommandPerformance — render', () => {
  it('renders without crashing with a single row', () => {
    render(<CommandPerformance data={singleRow} />)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('renders section heading', () => {
    render(<CommandPerformance data={multiRow} />)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })
})

// ─── Empty state ───────────────────────────────────────────────────────────────

describe('CommandPerformance — empty state', () => {
  it('shows empty-state message when data is empty', () => {
    render(<CommandPerformance data={[]} />)
    expect(screen.getByText('No command data for this period')).toBeInTheDocument()
  })

  it('still renders heading in empty state', () => {
    render(<CommandPerformance data={[]} />)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('does not render table headers in empty state', () => {
    render(<CommandPerformance data={[]} />)
    expect(screen.queryByText(/^command$/i)).toBeNull()
    expect(screen.queryByText(/^runs$/i)).toBeNull()
  })
})

// ─── Table structure ───────────────────────────────────────────────────────────

describe('CommandPerformance — table structure', () => {
  it('renders all column headers', () => {
    render(<CommandPerformance data={singleRow} />)
    expect(screen.getByText(/^command$/i)).toBeInTheDocument()
    expect(screen.getByText(/^runs$/i)).toBeInTheDocument()
    expect(screen.getByText(/^success rate$/i)).toBeInTheDocument()
    expect(screen.getByText(/^avg cost$/i)).toBeInTheDocument()
    expect(screen.getByText(/^avg duration$/i)).toBeInTheDocument()
    expect(screen.getByText(/^total cost$/i)).toBeInTheDocument()
  })

  it('renders a row for each command', () => {
    render(<CommandPerformance data={multiRow} />)
    expect(screen.getByText('/architect')).toBeInTheDocument()
    expect(screen.getByText('/developer')).toBeInTheDocument()
    expect(screen.getByText('/reviewer')).toBeInTheDocument()
  })

  it('renders totalRuns value', () => {
    render(<CommandPerformance data={singleRow} />)
    expect(screen.getByText('10')).toBeInTheDocument()
  })
})

// ─── Success rate badge colors ─────────────────────────────────────────────────

describe('CommandPerformance — SuccessRateBadge', () => {
  it('renders badge with percentage text for >= 80% rate', () => {
    render(<CommandPerformance data={singleRow} />)
    // 0.9 * 100 = 90%
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('renders badge with percentage text for >= 50% and < 80% rate', () => {
    const orangeRow = [{ ...singleRow[0], command: '/dev', successRate: 0.6 }]
    render(<CommandPerformance data={orangeRow} />)
    // 0.6 * 100 = 60%
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('renders badge with percentage text for < 50% rate', () => {
    const redRow = [{ ...singleRow[0], command: '/review', successRate: 0.33 }]
    render(<CommandPerformance data={redRow} />)
    // 0.33 * 100 = 33%
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('renders 100% badge for perfect success rate', () => {
    const perfectRow = [{ ...singleRow[0], successRate: 1.0 }]
    render(<CommandPerformance data={perfectRow} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders 0% badge for zero success rate', () => {
    const zeroRow = [{ ...singleRow[0], command: '/fail-cmd', successRate: 0 }]
    render(<CommandPerformance data={zeroRow} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('renders 80% badge (exactly at >= 80% boundary)', () => {
    const boundaryRow = [{ ...singleRow[0], command: '/boundary', successRate: 0.8 }]
    render(<CommandPerformance data={boundaryRow} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('renders 50% badge (exactly at >= 50% boundary)', () => {
    const boundaryRow = [{ ...singleRow[0], command: '/boundary50', successRate: 0.5 }]
    render(<CommandPerformance data={boundaryRow} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })
})

// ─── Cost formatting ───────────────────────────────────────────────────────────

describe('CommandPerformance — cost formatting', () => {
  it('formats avgCostUsd with $ and 4 decimal places', () => {
    render(<CommandPerformance data={singleRow} />)
    expect(screen.getByText('$0.0500')).toBeInTheDocument()
  })

  it('formats totalCostUsd with $ and 4 decimal places', () => {
    render(<CommandPerformance data={singleRow} />)
    expect(screen.getByText('$0.5000')).toBeInTheDocument()
  })

  it('shows "—" for null avgCostUsd', () => {
    render(<CommandPerformance data={multiRow} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Duration formatting ───────────────────────────────────────────────────────

describe('CommandPerformance — duration formatting', () => {
  it('formats avgDurationMs < 60s as seconds', () => {
    const shortRow = [{ ...singleRow[0], avgDurationMs: 45000 }]
    render(<CommandPerformance data={shortRow} />)
    expect(screen.getByText('45s')).toBeInTheDocument()
  })

  it('formats avgDurationMs >= 60s as minutes and seconds', () => {
    render(<CommandPerformance data={singleRow} />)
    // 60000ms → 60s → 1m 0s
    expect(screen.getByText('1m 0s')).toBeInTheDocument()
  })

  it('formats avgDurationMs of 90000ms as "1m 30s"', () => {
    const row = [{ ...singleRow[0], avgDurationMs: 90000 }]
    render(<CommandPerformance data={row} />)
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('shows "—" for null avgDurationMs', () => {
    render(<CommandPerformance data={multiRow} />)
    // /reviewer has null avgDurationMs
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('formats exactly 0ms as "0s"', () => {
    const zeroMs = [{ ...singleRow[0], avgDurationMs: 0 }]
    render(<CommandPerformance data={zeroMs} />)
    expect(screen.getByText('0s')).toBeInTheDocument()
  })
})

// ─── Sorting ───────────────────────────────────────────────────────────────────

describe('CommandPerformance — sorting', () => {
  it('toggles sort direction when same column is clicked twice', () => {
    render(<CommandPerformance data={multiRow} />)
    const runsHeader = screen.getByText(/^runs$/i)
    fireEvent.click(runsHeader)
    fireEvent.click(runsHeader)
    // No crash — direction toggled back
    expect(screen.getByText('/architect')).toBeInTheDocument()
  })

  it('switches to a new sort column when a different header is clicked', () => {
    render(<CommandPerformance data={multiRow} />)
    const commandHeader = screen.getByText(/^command$/i)
    fireEvent.click(commandHeader)
    expect(screen.getByText('/architect')).toBeInTheDocument()
    expect(screen.getByText('/developer')).toBeInTheDocument()
  })

  it('clicking "Command" header sorts alphabetically (asc on second click)', () => {
    render(<CommandPerformance data={multiRow} />)
    const commandHeader = screen.getByText(/^command$/i)
    // First click: sets sortKey to 'command', sortDir='desc' (Z→A)
    fireEvent.click(commandHeader)
    // Second click: same key → toggle dir to 'asc' (A→Z)
    fireEvent.click(commandHeader)
    const rows = screen.getAllByText(/^\//)
    expect(rows[0].textContent).toBe('/architect')
  })

  it('sorting by "Runs" descending puts highest totalRuns first', () => {
    render(<CommandPerformance data={multiRow} />)
    const runsHeader = screen.getByText(/^runs$/i)
    fireEvent.click(runsHeader) // desc
    const rows = screen.getAllByText(/^\//)
    // /architect has 10 runs, /developer has 5, /reviewer has 3
    expect(rows[0].textContent).toBe('/architect')
  })

  it('clicking "Success Rate" column header does not crash', () => {
    render(<CommandPerformance data={multiRow} />)
    const srHeader = screen.getByText(/^success rate$/i)
    fireEvent.click(srHeader)
    fireEvent.click(srHeader)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('clicking "Avg Cost" header does not crash', () => {
    render(<CommandPerformance data={multiRow} />)
    const header = screen.getByText(/^avg cost$/i)
    fireEvent.click(header)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('clicking "Avg Duration" header does not crash', () => {
    render(<CommandPerformance data={multiRow} />)
    const header = screen.getByText(/^avg duration$/i)
    fireEvent.click(header)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })

  it('clicking "Total Cost" header does not crash', () => {
    render(<CommandPerformance data={multiRow} />)
    const header = screen.getByText(/^total cost$/i)
    fireEvent.click(header)
    expect(screen.getByText('Command Performance')).toBeInTheDocument()
  })
})
