import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test-utils'
import { QuickVsExploreCard } from '../QuickVsExploreCard'
import type { SpendingResponse, ByModeEntry } from '../../../types/spending'

function makeMode(overrides: Partial<ByModeEntry>): ByModeEntry {
  return {
    mode: 'quick', totalRuns: 0, ticketsCreated: 0, totalCostUsd: 0,
    avgCostPerSpec: null, avgDurationMs: null, dominantModel: null, sparkline: [],
    ...overrides,
  } as ByModeEntry
}

const data: SpendingResponse = {
  summary: { totalCostUsd: 0, totalRuns: 0, failureRate: 0, prevTotalCostUsd: 0, deltaPct: null, avgCostPerRun: null },
  bySurface: [], byModel: [], dailyTimeline: [], scatter: [], topTickets: [],
  byMode: [
    makeMode({ mode: 'quick', totalRuns: 50, ticketsCreated: 40, avgCostPerSpec: 0.08, avgDurationMs: 2000, dominantModel: 'sonnet', sparkline: [1, 2, 1, 3] }),
    makeMode({ mode: 'explore', totalRuns: 30, ticketsCreated: 20, avgCostPerSpec: 0.71, avgDurationMs: 200000, dominantModel: 'opus', sparkline: [2, 3, 4, 3] }),
  ],
  trackingStartedAt: null, rangeFrom: '', rangeTo: '',
}

describe('QuickVsExploreCard', () => {
  it('renders both columns and the cost ratio', () => {
    render(<QuickVsExploreCard data={data} loading={false} />)
    expect(screen.getByText('Quick')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.getByText(/8.9× more per spec/)).toBeInTheDocument()
  })

  it('shows sparse-data CTA when Explore has < 5 runs', () => {
    const sparse: SpendingResponse = {
      ...data,
      byMode: [
        makeMode({ mode: 'quick', totalRuns: 50, ticketsCreated: 40, avgCostPerSpec: 0.08 }),
        makeMode({ mode: 'explore', totalRuns: 2, ticketsCreated: 1, avgCostPerSpec: 0.5 }),
      ],
    }
    render(<QuickVsExploreCard data={sparse} loading={false} />)
    expect(screen.getByText(/Try Explore for richer specs/i)).toBeInTheDocument()
    expect(screen.queryByText(/× more per spec/i)).not.toBeInTheDocument()
  })
})
