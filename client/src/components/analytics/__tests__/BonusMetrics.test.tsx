import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import React from 'react'

// BonusMetrics has no recharts dependency — no mock needed

import { BonusMetrics } from '../BonusMetrics'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fullData = {
  costPerSuccess: 0.042,
  apiEfficiencyPct: 87.5,
  failureCostUsd: 0.12,
  modelBreakdown: [
    { model: 'claude-opus-4', jobCount: 30, totalCostUsd: 1.0 },
    { model: 'claude-sonnet-4', jobCount: 15, totalCostUsd: 0.25 },
  ],
}

const nullNullableData = {
  costPerSuccess: null,
  apiEfficiencyPct: null,
  failureCostUsd: 0.0,
  modelBreakdown: [],
}

// ─── Render without crash ──────────────────────────────────────────────────────

describe('BonusMetrics — render', () => {
  it('renders without crashing with full data', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('Bonus Metrics')).toBeInTheDocument()
  })

  it('renders the "Bonus Metrics" section heading', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('Bonus Metrics')).toBeInTheDocument()
  })

  it('renders the "Model Breakdown" sub-heading', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('Model Breakdown')).toBeInTheDocument()
  })
})

// ─── StatCard labels ──────────────────────────────────────────────────────────

describe('BonusMetrics — stat card labels', () => {
  it('renders "Cost per Success" label', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('Cost per Success')).toBeInTheDocument()
  })

  it('renders "API Efficiency" label', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('API Efficiency')).toBeInTheDocument()
  })

  it('renders "Failure Cost" label', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('Failure Cost')).toBeInTheDocument()
  })
})

// ─── Number formatting ─────────────────────────────────────────────────────────

describe('BonusMetrics — number formatting', () => {
  it('formats costPerSuccess to 4 decimal places with $ prefix', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('$0.0420')).toBeInTheDocument()
  })

  it('formats apiEfficiencyPct to 0 decimal places with % suffix', () => {
    render(<BonusMetrics data={fullData} />)
    // 87.5.toFixed(0) → "88"
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('formats failureCostUsd to 4 decimal places with $ prefix', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('$0.1200')).toBeInTheDocument()
  })

  it('formats zero failureCostUsd as $0.0000', () => {
    render(<BonusMetrics data={{ ...fullData, failureCostUsd: 0 }} />)
    expect(screen.getByText('$0.0000')).toBeInTheDocument()
  })

  it('formats a precise costPerSuccess correctly', () => {
    render(<BonusMetrics data={{ ...fullData, costPerSuccess: 1.23456 }} />)
    expect(screen.getByText('$1.2346')).toBeInTheDocument()
  })

  it('formats apiEfficiencyPct of 100 as "100%"', () => {
    render(<BonusMetrics data={{ ...fullData, apiEfficiencyPct: 100 }} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('formats apiEfficiencyPct of 0 as "0%"', () => {
    render(<BonusMetrics data={{ ...fullData, apiEfficiencyPct: 0 }} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})

// ─── Null value handling ───────────────────────────────────────────────────────

describe('BonusMetrics — null value handling', () => {
  it('shows "—" when costPerSuccess is null', () => {
    render(<BonusMetrics data={{ ...fullData, costPerSuccess: null }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows "—" when apiEfficiencyPct is null', () => {
    render(<BonusMetrics data={{ ...fullData, apiEfficiencyPct: null }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows two "—" when both costPerSuccess and apiEfficiencyPct are null', () => {
    render(<BonusMetrics data={nullNullableData} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('still renders section heading when all nullable fields are null', () => {
    render(<BonusMetrics data={nullNullableData} />)
    expect(screen.getByText('Bonus Metrics')).toBeInTheDocument()
  })
})

// ─── Model breakdown — empty state ────────────────────────────────────────────

describe('BonusMetrics — empty modelBreakdown', () => {
  it('shows empty-state message when modelBreakdown is empty', () => {
    render(<BonusMetrics data={{ ...fullData, modelBreakdown: [] }} />)
    expect(screen.getByText('No model data for this period')).toBeInTheDocument()
  })

  it('does not render table headers when modelBreakdown is empty', () => {
    render(<BonusMetrics data={{ ...fullData, modelBreakdown: [] }} />)
    expect(screen.queryByText(/^model$/i)).toBeNull()
    expect(screen.queryByText(/^jobs$/i)).toBeNull()
    expect(screen.queryByText(/^total cost$/i)).toBeNull()
  })
})

// ─── Model breakdown — table with entries ─────────────────────────────────────

describe('BonusMetrics — modelBreakdown table', () => {
  it('renders a row for each model entry', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('claude-opus-4')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4')).toBeInTheDocument()
  })

  it('renders table column headers when data is present', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText(/^model$/i)).toBeInTheDocument()
    expect(screen.getByText(/^jobs$/i)).toBeInTheDocument()
    expect(screen.getByText(/^total cost$/i)).toBeInTheDocument()
  })

  it('renders jobCount values for each row', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders totalCostUsd formatted to 4 decimal places for each row', () => {
    render(<BonusMetrics data={fullData} />)
    // $1.0000 and $0.2500
    expect(screen.getByText('$1.0000')).toBeInTheDocument()
    expect(screen.getByText('$0.2500')).toBeInTheDocument()
  })

  it('does not show empty-state message when modelBreakdown has entries', () => {
    render(<BonusMetrics data={fullData} />)
    expect(screen.queryByText('No model data for this period')).toBeNull()
  })

  it('renders a single-entry modelBreakdown correctly', () => {
    const single = {
      ...fullData,
      modelBreakdown: [{ model: 'claude-haiku-3', jobCount: 5, totalCostUsd: 0.0010 }],
    }
    render(<BonusMetrics data={single} />)
    expect(screen.getByText('claude-haiku-3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('$0.0010')).toBeInTheDocument()
  })
})
