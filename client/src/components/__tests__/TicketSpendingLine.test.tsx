import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import { TicketSpendingLine } from '../TicketSpendingLine'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api/projects/p1',
}))

describe('TicketSpendingLine', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders nothing when summary has zero runs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalCostUsd: 0, totalTurns: 0, activeDurationMs: 0, totalRuns: 0,
        bySurface: { job: { count: 0, costUsd: 0 }, 'quick-spec': { count: 0, costUsd: 0 }, 'explore-spec': { count: 0, costUsd: 0 }, 'ai-edit': { count: 0, costUsd: 0 } },
      }),
    })
    const { container } = render(<TicketSpendingLine ticketId={1} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders cost / turns / duration / breakdown when summary has runs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalCostUsd: 4.2,
        totalTurns: 12,
        activeDurationMs: 204000,
        totalRuns: 4,
        bySurface: {
          job: { count: 2, costUsd: 3.5 },
          'quick-spec': { count: 0, costUsd: 0 },
          'explore-spec': { count: 1, costUsd: 0.5 },
          'ai-edit': { count: 1, costUsd: 0.2 },
        },
      }),
    })
    render(<TicketSpendingLine ticketId={42} />)
    await waitFor(() => expect(screen.getByText(/\$4\.20/)).toBeInTheDocument())
    expect(screen.getByText(/12 turns/)).toBeInTheDocument()
    expect(screen.getByText(/3m/)).toBeInTheDocument()
    expect(screen.getByText(/2 jobs/)).toBeInTheDocument()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/analytics?ticketId=42')
  })

  it('formats short duration in seconds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalCostUsd: 0.05, totalTurns: 1, activeDurationMs: 1500, totalRuns: 1,
        bySurface: { job: { count: 1, costUsd: 0.05 }, 'quick-spec': { count: 0, costUsd: 0 }, 'explore-spec': { count: 0, costUsd: 0 }, 'ai-edit': { count: 0, costUsd: 0 } },
      }),
    })
    render(<TicketSpendingLine ticketId={7} />)
    await waitFor(() => expect(screen.getByText(/1\.5s/)).toBeInTheDocument())
  })

  it('renders nothing when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    const { container } = render(<TicketSpendingLine ticketId={1} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when bySurface is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalCostUsd: 1, totalTurns: 1, activeDurationMs: 1, totalRuns: 1 }),
    })
    const { container } = render(<TicketSpendingLine ticketId={1} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
