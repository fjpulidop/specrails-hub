import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'

// Ensure IntersectionObserver is always available (vi.restoreAllMocks can wipe setup mocks)
beforeEach(() => {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    activeProjectId: 'proj-1',
    projects: [
      {
        id: 'proj-1',
        slug: 'proj-1',
        name: 'Project One',
        path: '/home/user/proj-1',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ],
    isLoading: false,
    setupProjectIds: new Set<string>(),
    setActiveProjectId: vi.fn(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

vi.mock('../../hooks/useActivity', () => ({
  useActivity: () => ({
    items: [],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), promise: vi.fn() },
  Toaster: () => null,
}))

// react-markdown and related plugins are ESM; stub them out
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-highlight', () => ({ default: () => {} }))
vi.mock('highlight.js/styles/atom-one-dark.css', () => ({}))

// ─── HubOverviewPage ──────────────────────────────────────────────────────────

describe('HubOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        aggregated: {
          totalCount: 1,
          healthyCount: 1,
          warningCount: 0,
          criticalCount: 0,
          jobsToday: 3,
          activeJobs: 0,
        },
        projects: [],
        recentJobs: [],
      }),
    })
  })

  it('renders Hub Overview heading', async () => {
    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)
    expect(screen.getByText('Hub Overview')).toBeInTheDocument()
  })

  it('renders search input', async () => {
    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)
    expect(screen.getByPlaceholderText(/search across all projects/i)).toBeInTheDocument()
  })

  it('renders aggregated stats after loading', async () => {
    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.queryByText('Projects')).toBeInTheDocument()
    })
  })

  it('renders "No projects registered yet" when projects array is empty', async () => {
    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('No projects registered yet.')).toBeInTheDocument()
    })
  })

  it('renders Recent Activity section after loading', async () => {
    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    })
  })

  it('renders search results on query (debounced)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aggregated: { totalCount: 1, healthyCount: 1, warningCount: 0, criticalCount: 0, jobsToday: 3, activeJobs: 0 },
          projects: [],
          recentJobs: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: 'test',
          groups: [],
          total: 0,
        }),
      })

    const HubOverviewPage = (await import('../HubOverviewPage')).default
    render(<HubOverviewPage />)

    await waitFor(() => { expect(screen.getByText('Hub Overview')).toBeInTheDocument() })

    const searchInput = screen.getByPlaceholderText(/search across all projects/i)
    fireEvent.change(searchInput, { target: { value: 'test query' } })

    // Debounced at 350ms — results load asynchronously
    await waitFor(() => {
      // The search query fetch should eventually fire
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/hub/search')
      )
    }, { timeout: 2000 })
  })
})

// ─── ActivityFeedPage ─────────────────────────────────────────────────────────

describe('ActivityFeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Activity heading', async () => {
    const ActivityFeedPage = (await import('../ActivityFeedPage')).default
    render(<ActivityFeedPage />)
    expect(screen.getByRole('heading', { name: /activity/i })).toBeInTheDocument()
  })

  it('renders empty state when no items', async () => {
    const ActivityFeedPage = (await import('../ActivityFeedPage')).default
    render(<ActivityFeedPage />)
    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeInTheDocument()
    })
  })

  it('renders activity items when provided', async () => {
    vi.doMock('../../hooks/useActivity', () => ({
      useActivity: () => ({
        items: [
          {
            id: 'item-1',
            type: 'job_completed' as const,
            jobId: 'job-1',
            jobCommand: '/architect --spec SPEA-001',
            timestamp: new Date().toISOString(),
            summary: 'Completed',
            costUsd: 0.05,
          },
        ],
        loading: false,
        hasMore: false,
        loadMore: vi.fn(),
      }),
    }))

    // Need fresh module import after mock change
    vi.resetModules()
    // Re-import with fresh mocks
    const ActivityFeedPageFresh = (await import('../ActivityFeedPage')).default
    render(<ActivityFeedPageFresh />)
    await waitFor(() => {
      expect(screen.getByText('/architect --spec SPEA-001')).toBeInTheDocument()
    })
  })
})

// ─── GlobalSettingsPage ───────────────────────────────────────────────────────

describe('GlobalSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/hub/webhooks')) {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [] }) })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ port: 4200, specrailsTechUrl: 'http://localhost:3000' }),
      })
    })
  })

  it('renders Hub Settings dialog when open=true', async () => {
    const GlobalSettingsPage = (await import('../GlobalSettingsPage')).default
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Hub Settings')).toBeInTheDocument()
    })
  })

  it('does not render dialog content when open=false', async () => {
    const GlobalSettingsPage = (await import('../GlobalSettingsPage')).default
    render(<GlobalSettingsPage open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Hub Settings')).toBeNull()
  })

  it('renders registered projects section when open=true', async () => {
    const GlobalSettingsPage = (await import('../GlobalSettingsPage')).default
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/registered projects/i)).toBeInTheDocument()
    })
  })

  it('renders specrails-tech URL field after loading', async () => {
    const GlobalSettingsPage = (await import('../GlobalSettingsPage')).default
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })
  })

  it('renders hub information section', async () => {
    const GlobalSettingsPage = (await import('../GlobalSettingsPage')).default
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Hub Information')).toBeInTheDocument()
    })
  })
})

// ─── DocsPage ─────────────────────────────────────────────────────────────────

describe('DocsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        categories: [
          {
            name: 'General',
            slug: 'general',
            docs: [
              { title: 'Getting Started', slug: 'getting-started' },
            ],
          },
        ],
      }),
    })
  })

  it('renders Documentation sidebar link', async () => {
    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      // There may be multiple "Documentation" elements (sidebar link + index heading)
      const items = screen.getAllByText(/documentation/i)
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders category names from the API', async () => {
    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      // "General" appears in sidebar and in index, use getAllByText
      const items = screen.getAllByText(/general/i)
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders doc links from categories', async () => {
    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      // "Getting Started" may appear in sidebar and index
      const items = screen.getAllByText(/getting started/i)
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders index page total doc count', async () => {
    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      // DocsIndex shows "1 document across 1 categories."
      expect(screen.getByText(/1 document/i)).toBeInTheDocument()
    })
  })

  it('renders empty state message when no docs', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ categories: [] }),
    })

    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
    })
  })

  it('falls back to empty categories when fetch fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))

    const DocsPage = (await import('../DocsPage')).default
    render(<DocsPage />)

    await waitFor(() => {
      expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
    })
  })
})
