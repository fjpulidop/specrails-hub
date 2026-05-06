import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../test-utils'
import { ModelBreakdown } from '../ModelBreakdown'
import type { SpendingResponse } from '../../../types/spending'

function emptyData(byModel: SpendingResponse['byModel'] = []): SpendingResponse {
  return {
    summary: { totalCostUsd: 0, totalRuns: 0, failureRate: 0, prevTotalCostUsd: 0, deltaPct: null, avgCostPerRun: null },
    bySurface: [], byModel, byMode: [], dailyTimeline: [], scatter: [], topTickets: [],
    trackingStartedAt: null, rangeFrom: '', rangeTo: '',
  }
}

describe('ModelBreakdown', () => {
  it('renders skeleton when loading without data', () => {
    const { container } = render(<ModelBreakdown data={null} loading onSelectModel={() => {}} activeModel={undefined} />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders empty state when no models', () => {
    render(<ModelBreakdown data={emptyData()} loading={false} onSelectModel={() => {}} activeModel={undefined} />)
    expect(screen.getByText(/No models recorded/i)).toBeInTheDocument()
  })

  it('renders top models with cost and count', () => {
    const data = emptyData([
      { model: 'opus', count: 10, costUsd: 8 },
      { model: 'sonnet', count: 50, costUsd: 2 },
    ])
    render(<ModelBreakdown data={data} loading={false} onSelectModel={() => {}} activeModel={undefined} />)
    expect(screen.getByText('opus')).toBeInTheDocument()
    expect(screen.getByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText(/\$8\.00 · 10/)).toBeInTheDocument()
  })

  it('fires onSelectModel when clicked', () => {
    const onSelect = vi.fn()
    const data = emptyData([{ model: 'opus', count: 10, costUsd: 8 }])
    render(<ModelBreakdown data={data} loading={false} onSelectModel={onSelect} activeModel={undefined} />)
    fireEvent.click(screen.getByText('opus').closest('button')!)
    expect(onSelect).toHaveBeenCalledWith('opus')
  })

  it('marks the active model with highlight styling', () => {
    const data = emptyData([
      { model: 'opus', count: 10, costUsd: 8 },
      { model: 'sonnet', count: 50, costUsd: 2 },
    ])
    render(<ModelBreakdown data={data} loading={false} onSelectModel={() => {}} activeModel="opus" />)
    const button = screen.getByText('opus').closest('button')!
    expect(button.className).toMatch(/accent-highlight/)
  })

  it('caps to top 5 models', () => {
    const data = emptyData(
      Array.from({ length: 8 }, (_, i) => ({ model: `m-${i}`, count: i + 1, costUsd: i + 1 }))
    )
    render(<ModelBreakdown data={data} loading={false} onSelectModel={() => {}} activeModel={undefined} />)
    expect(screen.queryByText('m-5')).not.toBeInTheDocument()
    expect(screen.getByText('m-0')).toBeInTheDocument()
  })
})
