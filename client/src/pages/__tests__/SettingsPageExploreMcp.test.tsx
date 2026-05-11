import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import SettingsPage from '../SettingsPage'
import type { ProjectConfig } from '../../types'

vi.mock('sonner', () => ({
  toast: { promise: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useBlocker: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
  }
})

vi.mock('../../lib/api', () => ({ getApiBase: () => '/api' }))

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
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

const mockConfig: ProjectConfig = {
  project: { name: 'Test Project', repo: null },
  issueTracker: {
    github: { available: false, authenticated: false },
    jira: { available: false, authenticated: false },
    active: null,
    labelFilter: '',
  },
  commands: [],
  dailyBudgetUsd: null,
}

function makeFetchMock(initialEnabled: boolean) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const urlStr = String(url)
    if (urlStr.endsWith('/explore-mcp-enabled') && opts?.method === 'PATCH') {
      const body = JSON.parse(opts.body as string) as { enabled: boolean }
      return Promise.resolve({ ok: true, json: async () => ({ enabled: body.enabled }) })
    }
    if (urlStr.endsWith('/explore-mcp-enabled')) {
      return Promise.resolve({ ok: true, json: async () => ({ enabled: initialEnabled }) })
    }
    if (urlStr.endsWith('/settings')) {
      return Promise.resolve({ ok: true, json: async () => ({ pipelineTelemetryEnabled: false, orchestratorModel: 'sonnet', prePrompt: '' }) })
    }
    if (urlStr.endsWith('/budget')) {
      return Promise.resolve({ ok: true, json: async () => ({ dailyBudgetUsd: null, jobCostThresholdUsd: null }) })
    }
    return Promise.resolve({ ok: true, json: async () => mockConfig })
  })
}

describe('SettingsPage — Explore Spec MCP toggle', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the Explore Spec section', async () => {
    global.fetch = makeFetchMock(false)
    render(<SettingsPage />)
    await waitFor(() => { expect(screen.getByText('Explore Spec')).toBeInTheDocument() })
  })

  it('toggle defaults to OFF when server returns false', async () => {
    global.fetch = makeFetchMock(false)
    render(<SettingsPage />)
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /use mcp servers in explore/i })
      expect(toggle.getAttribute('aria-checked')).toBe('false')
    })
  })

  it('toggle reflects server-reported true state', async () => {
    global.fetch = makeFetchMock(true)
    render(<SettingsPage />)
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /use mcp servers in explore/i })
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    })
  })

  it('clicking the toggle sends PATCH to /explore-mcp-enabled', async () => {
    const fetchMock = makeFetchMock(false)
    global.fetch = fetchMock
    render(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /use mcp servers in explore/i })).toBeInTheDocument()
    })
    const toggle = screen.getByRole('switch', { name: /use mcp servers in explore/i })
    fireEvent.click(toggle)
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          String(url).endsWith('/explore-mcp-enabled') && opts?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1].body as string) as { enabled: boolean }
      expect(body.enabled).toBe(true)
    })
  })
})
