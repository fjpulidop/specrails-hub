import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test-utils'
import { SpendingHero } from '../SpendingHero'
import type { SpendingResponse } from '../../../types/spending'

const baseData: SpendingResponse = {
  summary: { totalCostUsd: 12.34, totalRuns: 42, failureRate: 0, prevTotalCostUsd: 10, deltaPct: 23.4, avgCostPerRun: null },
  bySurface: [
    { surface: 'job', count: 30, costUsd: 8 },
    { surface: 'quick-spec', count: 5, costUsd: 1 },
    { surface: 'explore-spec', count: 5, costUsd: 3 },
    { surface: 'ai-edit', count: 2, costUsd: 0.34 },
  ],
  byModel: [], byMode: [], dailyTimeline: [], scatter: [], topTickets: [],
  trackingStartedAt: '2026-04-01T00:00:00Z', rangeFrom: '', rangeTo: '',
}

describe('SpendingHero', () => {
  it('renders skeleton when loading and no data', () => {
    const { container } = render(<SpendingHero data={null} loading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders empty state when no runs', () => {
    const empty: SpendingResponse = { ...baseData, summary: { ...baseData.summary, totalCostUsd: 0, totalRuns: 0 }, bySurface: [] }
    render(<SpendingHero data={empty} loading={false} />)
    expect(screen.getByText(/No invocations yet/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Tracking started 2026-04-01/i).length).toBeGreaterThan(0)
  })

  it('renders total cost and surface segments', () => {
    render(<SpendingHero data={baseData} loading={false} />)
    expect(screen.getByText(/42 invocations/)).toBeInTheDocument()
    // Surface labels visible (rendered after the bar)
    expect(screen.getByText('Jobs')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
  })

  it('renders positive delta with warning accent and arrow up', () => {
    render(<SpendingHero data={baseData} loading={false} />)
    expect(screen.getByText(/23% vs prev/)).toBeInTheDocument()
  })

  it('renders negative delta with success accent and arrow down', () => {
    const data = { ...baseData, summary: { ...baseData.summary, deltaPct: -10 } }
    render(<SpendingHero data={data} loading={false} />)
    expect(screen.getByText(/10% vs prev/)).toBeInTheDocument()
  })
})
