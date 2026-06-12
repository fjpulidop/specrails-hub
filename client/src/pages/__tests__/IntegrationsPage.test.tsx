import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import IntegrationsPage from '../IntegrationsPage'

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

const handlers = new Map<string, (m: unknown) => void>()
vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: (id: string, fn: (m: unknown) => void) => { handlers.set(id, fn) },
    unregisterHandler: (id: string) => { handlers.delete(id) },
  }),
}))

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api/projects/proj-1',
}))

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  handlers.clear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sampleCatalog = {
  plugins: [
    {
      name: 'serena',
      version: '1.0.0',
      description: 'Semantic nav',
      whatItDoes: ['symbol lookup'],
      requirements: [{ name: 'uv', minVersion: '0.1.0' }],
      status: 'not-installed',
    },
  ],
}

describe('IntegrationsPage', () => {
  it('renders cards for plugins from the catalog', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => sampleCatalog })
    render(<IntegrationsPage />)
    await waitFor(() => {
      expect(screen.getByText('serena')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('opens install dialog and fetches preview', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => sampleCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pluginName: 'serena',
          files: [{ path: '.mcp.json', op: 'create', summary: '+ mcpServers.serena' }],
          requirements: [{ name: 'uv', installed: true, executable: true, meetsMinimum: true, version: '0.1.0' }],
        }),
      })
    render(<IntegrationsPage />)
    await waitFor(() => screen.getByText('serena'))
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    await waitFor(() => {
      expect(screen.getByText(/Files that will change/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/\.mcp\.json/i)).toBeInTheDocument()
  })

  it('shows installed state with uninstall button', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [{
          ...sampleCatalog.plugins[0],
          status: 'installed',
          installedAt: 'now',
          health: 'ok',
        }],
      }),
    })
    render(<IntegrationsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /uninstall/i })).toBeInTheDocument()
    })
  })

  it('shows Auto-install button when uv prerequisite is missing', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => sampleCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pluginName: 'serena',
          files: [{ path: '.mcp.json', op: 'create' }],
          requirements: [{ name: 'uv', installed: false, executable: false, meetsMinimum: false, minVersion: '0.1.0' }],
        }),
      })
    render(<IntegrationsPage />)
    await waitFor(() => screen.getByText('serena'))
    fireEvent.click(screen.getByRole('button', { name: /install$/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /auto-install/i })).toBeInTheDocument()
    })
  })

  it('renders empty state when no plugins are bundled', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ plugins: [] }) })
    render(<IntegrationsPage />)
    await waitFor(() => {
      expect(screen.getByText(/no plugins are bundled/i)).toBeInTheDocument()
    })
  })

  it('renders orphan section', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [{
          name: 'old-thing',
          version: '0.1.0',
          description: 'gone',
          whatItDoes: [],
          requirements: [],
          status: 'orphan',
        }],
      }),
    })
    render(<IntegrationsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Deprecated/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /remove orphan/i })).toBeInTheDocument()
  })
})
