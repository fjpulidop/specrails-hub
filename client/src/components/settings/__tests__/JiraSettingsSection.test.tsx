import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useDesktop', () => ({
  useDesktop: () => ({ activeProjectId: 'p1' }),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
  },
}))

// Mock the jiraApi object — every method a vi.fn() set per test.
vi.mock('../../../lib/jira-api', () => ({
  jiraApi: {
    getConnection: vi.fn(),
    test: vi.fn(),
    discoverProjects: vi.fn(),
    discoverStatuses: vi.fn(),
    connect: vi.fn(),
    setEnabled: vi.fn(),
    disconnect: vi.fn(),
    syncNow: vi.fn(),
    resume: vi.fn(),
    listOutbox: vi.fn(),
    retryOutbox: vi.fn(),
  },
}))

import { JiraSettingsSection } from '../JiraSettingsSection'
import { jiraApi } from '../../../lib/jira-api'

// Typed handle on the mocked object.
const api = jiraApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const DISCONNECTED = { connected: false }

const CONNECTION = {
  projectId: 'p1',
  baseUrl: 'https://acme.atlassian.net',
  deployment: 'cloud' as const,
  apiVersion: '3' as const,
  authScheme: 'basic' as const,
  accountEmail: 'jane@acme.com',
  jiraProjectKey: 'ACME',
  jiraProjectId: '10001',
  enabled: true,
  statusMap: null,
  highWaterMs: null,
  hasToken: true,
}

const CONNECTED_STATE = {
  connected: true,
  connection: CONNECTION,
  outbox: { pending: 0, inflight: 0, done: 3, dead: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sensible defaults; individual tests override as needed.
  api.getConnection.mockResolvedValue(DISCONNECTED)
  api.listOutbox.mockResolvedValue({ ops: [], counts: { pending: 0, inflight: 0, done: 0, dead: 0 } })
})

// ── Disconnected: the setup wizard ───────────────────────────────────────────

describe('JiraSettingsSection — disconnected wizard', () => {
  it('renders step 1 when not connected', async () => {
    api.getConnection.mockResolvedValue(DISCONNECTED)
    render(<JiraSettingsSection />)
    await screen.findByText(/Connect your Jira account/i)
    expect(screen.getByText(/Step 1 of 4/i)).toBeInTheDocument()
  })

  it('happy path: test → pick project → statuses → review → connect', async () => {
    api.getConnection
      .mockResolvedValueOnce(DISCONNECTED) // initial mount
      .mockResolvedValue(CONNECTED_STATE) // after onConnected reload
    api.test.mockResolvedValue({ ok: true, deployment: 'cloud', displayName: 'Jane' })
    api.discoverProjects.mockResolvedValue({
      projects: [
        { id: '1', key: 'ACME', name: 'Acme Corp' },
        { id: '2', key: 'WEB', name: 'Web Platform' },
      ],
    })
    api.discoverStatuses.mockResolvedValue({
      statuses: [{ id: 's1', name: 'To Do', category: 'new' }],
    })
    api.connect.mockResolvedValue({ connection: CONNECTION })

    render(<JiraSettingsSection />)
    await screen.findByText(/Connect your Jira account/i)

    // Fill credentials.
    const inputs = screen.getAllByRole('textbox') // baseUrl + email (password is not a textbox)
    fireEvent.change(inputs[0], { target: { value: 'https://acme.atlassian.net' } })
    fireEvent.change(inputs[1], { target: { value: 'jane@acme.com' } })
    const password = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'tok123' } })

    // Test connection.
    const testBtn = screen.getByRole('button', { name: /Test connection/i })
    expect(testBtn).not.toBeDisabled()
    fireEvent.click(testBtn)

    await screen.findByTestId('jira-test-ok')
    expect(screen.getByText(/Connected as Jane/i)).toBeInTheDocument()

    // Next is now enabled → go to projects.
    const next1 = screen.getByRole('button', { name: /^Next$/i })
    expect(next1).not.toBeDisabled()
    fireEvent.click(next1)

    await screen.findByText(/Choose a Jira project/i)
    await waitFor(() => expect(api.discoverProjects).toHaveBeenCalled())
    await screen.findByTestId('jira-project-list')

    // Pick a project.
    const acme = screen.getByRole('button', { name: /ACME/ })
    fireEvent.click(acme)

    // Next → status mapping.
    const next2 = screen.getByRole('button', { name: /^Next$/i })
    await waitFor(() => expect(next2).not.toBeDisabled())
    fireEvent.click(next2)

    await screen.findByText(/Map statuses/i)
    await waitFor(() => expect(api.discoverStatuses).toHaveBeenCalled())

    // Next → review.
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText(/Review & connect/i)

    // Connect.
    const connectBtn = screen.getByRole('button', { name: /^Connect$/i })
    fireEvent.click(connectBtn)
    await waitFor(() => expect(api.connect).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalled()

    // onConnected → reload → connected card now renders.
    await screen.findByText(/Connected to ACME/i)
  })

  it('test-failure path: rejected test shows toast.error and keeps Next disabled', async () => {
    api.getConnection.mockResolvedValue(DISCONNECTED)
    api.test.mockRejectedValue(new Error('Invalid credentials'))

    render(<JiraSettingsSection />)
    await screen.findByText(/Connect your Jira account/i)

    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'https://acme.atlassian.net' } })
    const password = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'bad' } })

    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Invalid credentials'))
    // No connected-as line, and Next stays disabled.
    expect(screen.queryByTestId('jira-test-ok')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled()
  })

  it('Test connection button is disabled until baseUrl + token are present', async () => {
    api.getConnection.mockResolvedValue(DISCONNECTED)
    render(<JiraSettingsSection />)
    await screen.findByText(/Connect your Jira account/i)

    expect(screen.getByRole('button', { name: /Test connection/i })).toBeDisabled()
  })

  it('falls back to the wizard when getConnection rejects', async () => {
    api.getConnection.mockRejectedValue(new Error('boom'))
    render(<JiraSettingsSection />)
    await screen.findByText(/Connect your Jira account/i)
  })
})

// ── Connected: the status card ───────────────────────────────────────────────

describe('JiraSettingsSection — connected card', () => {
  beforeEach(() => {
    api.getConnection.mockResolvedValue(CONNECTED_STATE)
  })

  it('renders the connected card with the enabled toggle', async () => {
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('toggling the switch calls setEnabled', async () => {
    api.setEnabled.mockResolvedValue({ connection: { ...CONNECTION, enabled: false } })
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(false))
  })

  it('toggle failure reverts the switch and toasts', async () => {
    api.setEnabled.mockRejectedValue(new Error('nope'))
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    const sw = screen.getByRole('switch')
    fireEvent.click(sw)
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('nope'))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
  })

  it('Sync now calls syncNow and shows a success toast', async () => {
    api.syncNow.mockResolvedValue({ ok: true, upserted: 7 })
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    fireEvent.click(screen.getByRole('button', { name: /Sync now/i }))
    await waitFor(() => expect(api.syncNow).toHaveBeenCalled())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('Sync now failure toasts an error', async () => {
    api.syncNow.mockRejectedValue(new Error('sync failed'))
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    fireEvent.click(screen.getByRole('button', { name: /Sync now/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('sync failed'))
  })

  it('renders a dead-letter op and Retry calls retryOutbox', async () => {
    api.getConnection.mockResolvedValue({
      ...CONNECTED_STATE,
      outbox: { pending: 0, inflight: 0, done: 0, dead: 1 },
    })
    api.listOutbox.mockResolvedValue({
      ops: [
        {
          id: 99,
          jiraIssueId: 'ACME-1',
          opType: 'transition',
          state: 'dead',
          attempts: 5,
          lastError: 'no transition',
          deadReason: 'workflow mismatch',
          createdAt: '',
          updatedAt: '',
        },
      ],
      counts: { pending: 0, inflight: 0, done: 0, dead: 1 },
    })
    api.retryOutbox.mockResolvedValue({ ok: true })

    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)
    await screen.findByText(/workflow mismatch/i)

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => expect(api.retryOutbox).toHaveBeenCalledWith(99))
  })

  it('Disconnect calls disconnect after confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.disconnect.mockResolvedValue({ connected: false })
    api.getConnection
      .mockResolvedValueOnce(CONNECTED_STATE) // initial
      .mockResolvedValue(DISCONNECTED) // after onChanged

    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))
    await waitFor(() => expect(api.disconnect).toHaveBeenCalled())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('Disconnect aborts when confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<JiraSettingsSection />)
    await screen.findByText(/Connected to ACME/i)

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))
    await waitFor(() => expect(api.disconnect).not.toHaveBeenCalled())
    confirmSpy.mockRestore()
  })
})
