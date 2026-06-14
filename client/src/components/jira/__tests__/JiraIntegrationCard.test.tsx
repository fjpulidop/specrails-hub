import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test-utils'

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }))

vi.mock('../../../lib/jira-api', () => ({
  jiraApi: {
    getConnection: vi.fn(),
    setEnabled: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn(),
    listOutbox: vi.fn(),
    retryOutbox: vi.fn(),
    test: vi.fn(),
    discoverProjects: vi.fn(),
    discoverStatuses: vi.fn(),
    connect: vi.fn(),
  },
}))

import { JiraIntegrationCard } from '../JiraIntegrationCard'
import { jiraApi } from '../../../lib/jira-api'

const api = jiraApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const connectedState = {
  connected: true,
  connection: {
    projectId: 'p1',
    baseUrl: 'https://acme.atlassian.net',
    deployment: 'cloud',
    apiVersion: '3',
    authScheme: 'basic',
    accountEmail: 'a@b.com',
    jiraProjectKey: 'PROJ',
    jiraProjectId: '1',
    enabled: true,
    statusMap: null,
    highWaterMs: null,
    hasToken: true,
  },
  outbox: { pending: 0, inflight: 0, done: 3, dead: 1 },
}

describe('JiraIntegrationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listOutbox.mockResolvedValue({ ops: [], counts: { pending: 0, inflight: 0, done: 0, dead: 0 } })
  })

  it('renders a Connect button and opens the wizard modal when not connected', async () => {
    api.getConnection.mockResolvedValue({ connected: false })
    render(<JiraIntegrationCard activeProjectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('jira-connect-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('jira-connect-btn'))
    await waitFor(() => expect(screen.getByTestId('jira-wizard')).toBeInTheDocument())
  })

  it('shows the Connected state and opens the Manage modal with the connected card', async () => {
    api.getConnection.mockResolvedValue(connectedState)
    render(<JiraIntegrationCard activeProjectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('jira-connected-badge')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('jira-manage-btn'))
    await waitFor(() => expect(screen.getByTestId('jira-connected')).toBeInTheDocument())
    // PROJ key surfaced in the connected card header.
    expect(screen.getAllByText(/PROJ/).length).toBeGreaterThan(0)
  })

  it('toggles sync, runs Sync now, and disconnects from the Manage modal', async () => {
    api.getConnection.mockResolvedValue(connectedState)
    api.setEnabled.mockResolvedValue({ connection: connectedState.connection })
    api.syncNow.mockResolvedValue({ ok: true, upserted: 4 })
    api.disconnect.mockResolvedValue({ connected: false })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<JiraIntegrationCard activeProjectId="p1" />)
    await waitFor(() => screen.getByTestId('jira-manage-btn'))
    fireEvent.click(screen.getByTestId('jira-manage-btn'))
    await waitFor(() => screen.getByTestId('jira-connected'))

    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(false))

    fireEvent.click(screen.getByRole('button', { name: /sync now/i }))
    await waitFor(() => expect(api.syncNow).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
    await waitFor(() => expect(api.disconnect).toHaveBeenCalled())
  })
})
