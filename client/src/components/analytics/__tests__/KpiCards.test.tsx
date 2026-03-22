import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// KpiCards has no recharts dependency — no mock needed

import { KpiCards } from '../KpiCards'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const previousPeriod = {
  label: 'Previous 7 days',
  from: '2026-03-08',
  to: '2026-03-14',
  totalCostUsd: 1.1345,
  totalJobs: 37,
  successRate: 0.855,
  avgDurationMs: 95000,
  totalTokens: 130000,
}

const fullKpi = {
  totalCostUsd: 1.2345,
  totalJobs: 42,
  successRate: 0.875,
  avgDurationMs: 90000,
  totalTokens: 150000,
  costDelta: 0.1,
  jobsDelta: 5,
  successRateDelta: 0.02,
  avgDurationDelta: -5000,
  totalTokensDelta: 20000,
  costDeltaPct: 8.8,
  jobsDeltaPct: 13.5,
  successRateDeltaPct: 2.3,
  avgDurationDeltaPct: -5.3,
  totalTokensDeltaPct: 15.4,
  previousPeriod,
}

const nullDeltasKpi = {
  ...fullKpi,
  costDelta: null,
  jobsDelta: null,
  successRateDelta: null,
  avgDurationDelta: null,
  totalTokensDelta: null,
  costDeltaPct: null,
  jobsDeltaPct: null,
  successRateDeltaPct: null,
  avgDurationDeltaPct: null,
  totalTokensDeltaPct: null,
  previousPeriod: null,
}

// ─── Render all 5 cards ────────────────────────────────────────────────────────

describe('KpiCards — renders all 5 cards', () => {
  it('renders without crashing', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
  })

  it('renders "Total Cost" card label', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
  })

  it('renders "Total Jobs" card label', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Total Jobs')).toBeInTheDocument()
  })

  it('renders "Success Rate" card label', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Success Rate')).toBeInTheDocument()
  })

  it('renders "Avg Duration" card label', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Avg Duration')).toBeInTheDocument()
  })

  it('renders "Total Tokens" card label', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
  })

  it('renders all 5 labels with null deltas (no previous period)', () => {
    render(<KpiCards kpi={nullDeltasKpi} />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('Total Jobs')).toBeInTheDocument()
    expect(screen.getByText('Success Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg Duration')).toBeInTheDocument()
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
  })
})

// ─── Cost formatting ───────────────────────────────────────────────────────────

describe('KpiCards — cost formatting', () => {
  it('formats totalCostUsd with 4 decimal places and $ prefix', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('$1.2345')).toBeInTheDocument()
  })

  it('formats zero cost as "$0.0000"', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalCostUsd: 0 }} />)
    expect(screen.getByText('$0.0000')).toBeInTheDocument()
  })

  it('formats a precise cost value correctly', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalCostUsd: 0.5678 }} />)
    expect(screen.getByText('$0.5678')).toBeInTheDocument()
  })
})

// ─── Success rate formatting ───────────────────────────────────────────────────

describe('KpiCards — success rate formatting', () => {
  it('formats successRate as percentage with 1 decimal place', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('87.5%')).toBeInTheDocument()
  })

  it('formats 100% success rate', () => {
    render(<KpiCards kpi={{ ...fullKpi, successRate: 1.0 }} />)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })

  it('formats 0% success rate', () => {
    render(<KpiCards kpi={{ ...fullKpi, successRate: 0 }} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})

// ─── Duration formatting ───────────────────────────────────────────────────────

describe('KpiCards — duration formatting', () => {
  it('formats avgDurationMs < 60000 as seconds only', () => {
    render(<KpiCards kpi={{ ...fullKpi, avgDurationMs: 45000 }} />)
    expect(screen.getByText('45s')).toBeInTheDocument()
  })

  it('formats avgDurationMs >= 60000 as minutes and seconds', () => {
    render(<KpiCards kpi={fullKpi} />)
    // 90000ms → 90s → 1m 30s
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('formats 0ms as "0s"', () => {
    render(<KpiCards kpi={{ ...fullKpi, avgDurationMs: 0 }} />)
    expect(screen.getByText('0s')).toBeInTheDocument()
  })

  it('renders "—" for null avgDurationMs', () => {
    render(<KpiCards kpi={{ ...fullKpi, avgDurationMs: null }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('formats exactly 60000ms as "1m 0s"', () => {
    render(<KpiCards kpi={{ ...fullKpi, avgDurationMs: 60000 }} />)
    expect(screen.getByText('1m 0s')).toBeInTheDocument()
  })
})

// ─── Token formatting ──────────────────────────────────────────────────────────

describe('KpiCards — token formatting', () => {
  it('formats totalTokens >= 1000 as K with 1 decimal place', () => {
    render(<KpiCards kpi={fullKpi} />)
    // 150000 → 150.0K
    expect(screen.getByText('150.0K')).toBeInTheDocument()
  })

  it('formats totalTokens >= 1_000_000 as M with 1 decimal place', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalTokens: 1500000 }} />)
    expect(screen.getByText('1.5M')).toBeInTheDocument()
  })

  it('formats totalTokens < 1000 as a plain number', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalTokens: 500 }} />)
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('formats exactly 1000 tokens as "1.0K"', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalTokens: 1000 }} />)
    expect(screen.getByText('1.0K')).toBeInTheDocument()
  })

  it('formats exactly 1_000_000 tokens as "1.0M"', () => {
    render(<KpiCards kpi={{ ...fullKpi, totalTokens: 1_000_000 }} />)
    expect(screen.getByText('1.0M')).toBeInTheDocument()
  })
})

// ─── Previous period values ────────────────────────────────────────────────────

describe('KpiCards — previous period display', () => {
  it('renders prev cost when previousPeriod is present', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('prev: $1.1345')).toBeInTheDocument()
  })

  it('renders prev job count when previousPeriod is present', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('prev: 37')).toBeInTheDocument()
  })

  it('renders prev success rate when previousPeriod is present', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('prev: 85.5%')).toBeInTheDocument()
  })

  it('renders prev avg duration when previousPeriod is present', () => {
    render(<KpiCards kpi={fullKpi} />)
    // 95000ms → 95s → 1m 35s
    expect(screen.getByText('prev: 1m 35s')).toBeInTheDocument()
  })

  it('renders prev total tokens when previousPeriod is present', () => {
    render(<KpiCards kpi={fullKpi} />)
    // 130000 → 130.0K
    expect(screen.getByText('prev: 130.0K')).toBeInTheDocument()
  })

  it('does not render any prev: values when previousPeriod is null', () => {
    render(<KpiCards kpi={nullDeltasKpi} />)
    expect(screen.queryByText(/prev:/)).toBeNull()
  })

  it('handles null avgDurationMs in previousPeriod (renders "prev: —")', () => {
    const kpiWithNullPrevDuration = {
      ...fullKpi,
      previousPeriod: { ...previousPeriod, avgDurationMs: null },
    }
    render(<KpiCards kpi={kpiWithNullPrevDuration} />)
    expect(screen.getByText(/prev: —/)).toBeInTheDocument()
  })
})

// ─── Trend badges ──────────────────────────────────────────────────────────────

describe('KpiCards — trend badges', () => {
  it('shows percentage delta when deltaPct is available', () => {
    render(<KpiCards kpi={fullKpi} />)
    // costDeltaPct = 8.8
    expect(screen.getByText('+8.8%')).toBeInTheDocument()
  })

  it('shows positive jobsDeltaPct', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('+13.5%')).toBeInTheDocument()
  })

  it('shows positive successRateDeltaPct', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('+2.3%')).toBeInTheDocument()
  })

  it('shows negative avgDurationDeltaPct', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('-5.3%')).toBeInTheDocument()
  })

  it('shows positive totalTokensDeltaPct', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('+15.4%')).toBeInTheDocument()
  })

  it('renders no trend badges when all deltas are null', () => {
    render(<KpiCards kpi={nullDeltasKpi} />)
    // No +/- percentage badges should be present
    expect(screen.queryByText(/\+\d+\.\d+%/)).toBeNull()
    expect(screen.queryByText(/-\d+\.\d+%/)).toBeNull()
  })

  it('renders zero delta as neutral (no + or - prefix)', () => {
    const zeroDeltaKpi = {
      ...fullKpi,
      costDelta: 0,
      costDeltaPct: 0,
    }
    render(<KpiCards kpi={zeroDeltaKpi} />)
    // formatPctDelta(0) → "+0.0%" because pct > 0 is false, sign is ''
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})

// ─── lowerIsBetter logic ──────────────────────────────────────────────────────

describe('KpiCards — lowerIsBetter trend color logic', () => {
  it('cost card: negative delta is "good" (green) — no crash test', () => {
    // Just verify render doesn't crash when cost decreases
    const decreasedCostKpi = {
      ...fullKpi,
      costDelta: -0.1,
      costDeltaPct: -8.8,
    }
    render(<KpiCards kpi={decreasedCostKpi} />)
    expect(screen.getByText('-8.8%')).toBeInTheDocument()
  })

  it('avg duration card: negative delta is "good" — no crash test', () => {
    const fasterKpi = {
      ...fullKpi,
      avgDurationDelta: -10000,
      avgDurationDeltaPct: -10.5,
    }
    render(<KpiCards kpi={fasterKpi} />)
    expect(screen.getByText('-10.5%')).toBeInTheDocument()
  })

  it('jobs card: positive delta is "good" — renders positive percentage', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('+13.5%')).toBeInTheDocument()
  })

  it('success rate card: positive delta is "good" — renders positive percentage', () => {
    render(<KpiCards kpi={fullKpi} />)
    expect(screen.getByText('+2.3%')).toBeInTheDocument()
  })
})
