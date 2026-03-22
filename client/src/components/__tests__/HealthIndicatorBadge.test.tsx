import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import { HealthIndicatorBadge } from '../HealthIndicatorBadge'

// Mock useHub
vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({ activeProjectId: 'proj-1' }),
}))

describe('HealthIndicatorBadge', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders health score when metrics are available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ healthScore: 85 }),
    })

    render(<HealthIndicatorBadge />)

    await waitFor(() => {
      expect(screen.getByTestId('health-indicator-badge')).toBeInTheDocument()
      expect(screen.getByText('85')).toBeInTheDocument()
    })
  })

  it('renders nothing when metrics fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    render(<HealthIndicatorBadge />)

    // Should not render the badge
    await waitFor(() => {
      expect(screen.queryByTestId('health-indicator-badge')).not.toBeInTheDocument()
    })
  })

  it('applies green styling for high health score', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ healthScore: 90 }),
    })

    render(<HealthIndicatorBadge />)

    await waitFor(() => {
      const badge = screen.getByTestId('health-indicator-badge')
      expect(badge.className).toContain('#50fa7b')
    })
  })

  it('applies yellow styling for medium health score', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ healthScore: 60 }),
    })

    render(<HealthIndicatorBadge />)

    await waitFor(() => {
      const badge = screen.getByTestId('health-indicator-badge')
      expect(badge.className).toContain('#f1fa8c')
    })
  })

  it('applies red styling for low health score', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ healthScore: 30 }),
    })

    render(<HealthIndicatorBadge />)

    await waitFor(() => {
      const badge = screen.getByTestId('health-indicator-badge')
      expect(badge.className).toContain('#ff5555')
    })
  })
})
