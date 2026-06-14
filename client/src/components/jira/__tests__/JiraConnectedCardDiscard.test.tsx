import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test-utils'

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }))

vi.mock('../../../lib/jira-api', () => ({
  jiraApi: {
    listOutbox: vi.fn(),
    listStatuses: vi.fn(),
    patchConnection: vi.fn(),
    setEnabled: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn(),
    retryOutbox: vi.fn(),
  },
}))

import { JiraConnectedCard } from '../JiraConnectedCard'
import { jiraApi, type ConnectionState } from '../../../lib/jira-api'

const api = jiraApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const STATUSES = [
  { id: '10', name: 'To Do', category: 'new' },
  { id: '11', name: 'In Progress', category: 'indeterminate' },
  { id: '12', name: 'Cancelled', category: 'done' },
]

function makeState(discardStatus: string | null): ConnectionState {
  return {
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
      discardStatus,
      hasToken: true,
    },
    outbox: { pending: 0, inflight: 0, done: 0, dead: 0 },
  }
}

describe('JiraConnectedCard — discard status picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listOutbox.mockResolvedValue({ ops: [], counts: { pending: 0, inflight: 0, done: 0, dead: 0 } })
    api.listStatuses.mockResolvedValue({ statuses: STATUSES })
    api.patchConnection.mockResolvedValue({ connection: makeState(null).connection })
  })

  it('loads the board statuses and renders them in the discard picker (default null)', async () => {
    render(<JiraConnectedCard state={makeState(null)} onChanged={vi.fn()} />)

    await waitFor(() => expect(api.listStatuses).toHaveBeenCalled())

    const select = (await screen.findByTestId('jira-discard-status-select')) as HTMLSelectElement
    // No discard status configured yet → default empty option selected.
    expect(select.value).toBe('')
    await waitFor(() => {
      for (const st of STATUSES) {
        expect(screen.getByRole('option', { name: st.name })).toBeInTheDocument()
      }
    })
  })

  it('defaults the picker to the connection.discardStatus when set', async () => {
    render(<JiraConnectedCard state={makeState('Cancelled')} onChanged={vi.fn()} />)

    const select = (await screen.findByTestId('jira-discard-status-select')) as HTMLSelectElement
    expect(select.value).toBe('Cancelled')
  })

  it('patches the connection and calls onChanged when the discard status changes', async () => {
    const onChanged = vi.fn()
    render(<JiraConnectedCard state={makeState(null)} onChanged={onChanged} />)

    const select = (await screen.findByTestId('jira-discard-status-select')) as HTMLSelectElement
    await waitFor(() => expect(screen.getByRole('option', { name: 'Cancelled' })).toBeInTheDocument())

    fireEvent.change(select, { target: { value: 'Cancelled' } })

    await waitFor(() => expect(api.patchConnection).toHaveBeenCalledWith({ discardStatus: 'Cancelled' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(select.value).toBe('Cancelled')
  })

  it('patches discardStatus null when the picker is reset to the none option', async () => {
    const onChanged = vi.fn()
    render(<JiraConnectedCard state={makeState('Cancelled')} onChanged={onChanged} />)

    const select = (await screen.findByTestId('jira-discard-status-select')) as HTMLSelectElement
    expect(select.value).toBe('Cancelled')

    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => expect(api.patchConnection).toHaveBeenCalledWith({ discardStatus: null }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })
})
