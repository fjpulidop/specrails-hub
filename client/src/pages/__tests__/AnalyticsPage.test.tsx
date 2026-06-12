import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import AnalyticsPage from '../AnalyticsPage'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api',
}))

vi.mock('../../hooks/useDesktop', () => ({
  useDesktop: () => ({
    activeProjectId: 'proj-1',
    projects: [],
    isLoading: false,
    setupProjectIds: new Set(),
    setActiveProjectId: vi.fn(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: vi.fn(),
    unregisterHandler: vi.fn(),
    connectionStatus: 'connected',
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Stub all dashboard child components to keep test focus on the page wiring.
vi.mock('../../components/analytics/SpendingHero', () => ({
  SpendingHero: ({ data }: { data: unknown }) => (
    <div data-testid="hero">{data ? 'hero-loaded' : 'hero-loading'}</div>
  ),
}))
vi.mock('../../components/analytics/ProviderBreakdownCard', () => ({
  ProviderBreakdownCard: () => <div data-testid="provider-breakdown">provider</div>,
}))
vi.mock('../../components/analytics/SpendingTimeline', () => ({
  SpendingTimeline: () => <div data-testid="timeline">timeline</div>,
}))
vi.mock('../../components/analytics/QuickVsExploreCard', () => ({
  QuickVsExploreCard: () => <div data-testid="qvse">qvse</div>,
}))
vi.mock('../../components/analytics/ModelBreakdown', () => ({
  ModelBreakdown: () => <div data-testid="models">models</div>,
}))
vi.mock('../../components/analytics/CostScatter', () => ({
  CostScatter: () => <div data-testid="scatter">scatter</div>,
}))
vi.mock('../../components/analytics/TopTicketsCrossSurface', () => ({
  TopTicketsCrossSurface: () => <div data-testid="top">top</div>,
}))
vi.mock('../../components/analytics/InvocationsTable', () => ({
  InvocationsTable: () => <div data-testid="table">table</div>,
}))
vi.mock('../../components/ExportDropdown', () => ({
  ExportDropdown: ({ disabled }: { disabled?: boolean }) => (
    <button data-testid="export" disabled={disabled}>Export</button>
  ),
}))

const emptySpending = {
  summary: {
    totalCostUsd: 0,
    totalEstimatedCostUsd: 0,
    totalRuns: 0,
    failureRate: 0,
    prevTotalCostUsd: 0,
    deltaPct: null,
    avgCostPerRun: null,
  },
  bySurface: [], byModel: [], byMode: [], byProvider: [], dailyTimeline: [], scatter: [], topTickets: [],
  trackingStartedAt: null, rangeFrom: '', rangeTo: '',
}
const emptyInvocations = { rows: [], total: 0, truncated: false, totalAvailable: 0 }

function mockFetch() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/spending')) return Promise.resolve({ ok: true, json: async () => emptySpending })
    if (url.includes('/invocations')) return Promise.resolve({ ok: true, json: async () => emptyInvocations })
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

function renderPage() {
  return render(<AnalyticsPage />)
}

describe('AnalyticsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFetch() })

  it('renders the seven dashboard blocks once data loads', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('hero').textContent).toBe('hero-loaded'))
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(screen.getByTestId('qvse')).toBeInTheDocument()
    expect(screen.getByTestId('models')).toBeInTheDocument()
    expect(screen.getByTestId('scatter')).toBeInTheDocument()
    expect(screen.getByTestId('top')).toBeInTheDocument()
    expect(screen.getByTestId('table')).toBeInTheDocument()
  })

  it('disables export when there are no invocations', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('hero').textContent).toBe('hero-loaded'))
    expect(screen.getByTestId('export')).toBeDisabled()
  })

  it('changing the period triggers a refetch', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('hero').textContent).toBe('hero-loaded'))
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await user.click(screen.getByRole('button', { name: '7d' }))
    await waitFor(() => {
      const callsAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
    const lastSpendingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .filter((u) => u.includes('/spending')).at(-1)
    expect(lastSpendingCall).toContain('period=7d')
  })

  it('toggling a surface chip updates the URL filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('hero').textContent).toBe('hero-loaded'))
    await user.click(screen.getByRole('button', { name: 'Jobs' }))
    await waitFor(() => {
      const lastSpendingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0] as string)
        .filter((u) => u.includes('/spending')).at(-1)
      expect(lastSpendingCall).toContain('surface=job')
    })
  })
})
