import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileViewer, type SummaryAction } from '../FileViewer'
import { SharedWebSocketContext } from '../../../hooks/useSharedWebSocket'

vi.mock('../CodeViewerMonaco', () => ({
  CodeViewerMonaco: ({ content }: { content: string }) => <div data-testid="monaco-stub">{content}</div>,
}))

vi.mock('../../../context/TicketDetailModalContext', () => ({
  useTicketDetailModal: () => ({ openTicketDetail: vi.fn() }),
}))

vi.mock('../../../hooks/useHub', () => ({
  useHub: () => ({ activeProjectId: 'p1' }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const handlers = new Map<string, (m: unknown) => void>()
const fakeWs = {
  registerHandler: (id: string, fn: (m: unknown) => void) => { handlers.set(id, fn) },
  unregisterHandler: (id: string) => { handlers.delete(id) },
  connectionStatus: 'connected' as const,
}

function wrap(ui: React.ReactNode) {
  return <SharedWebSocketContext.Provider value={fakeWs}>{ui}</SharedWebSocketContext.Provider>
}

function captureSummaryAction() {
  let action: SummaryAction | null = null
  return {
    onChange: (next: SummaryAction | null) => { action = next },
    get: () => action,
  }
}

beforeEach(() => {
  handlers.clear()
})

describe('FileViewer', () => {
  it('renders binary state and suppresses Monaco', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ binary: true, sizeBytes: 100, mime: 'image/png' }),
    }) as never
    const summaryAction = captureSummaryAction()
    render(wrap(<FileViewer relPath="img/x.png" onSummaryActionChange={summaryAction.onChange} />))
    await waitFor(() => {
      expect(screen.getByTestId('file-binary')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('monaco-stub')).not.toBeInTheDocument()
    expect(screen.getByText('Summary unavailable: binary file.')).toBeInTheDocument()
    await waitFor(() => expect(summaryAction.get()?.disabledReason).toBe('binary file'))
  })

  it('renders too-large state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tooLarge: true, sizeBytes: 3 * 1024 * 1024 }),
    }) as never
    const summaryAction = captureSummaryAction()
    render(wrap(<FileViewer relPath="big.ts" onSummaryActionChange={summaryAction.onChange} />))
    await waitFor(() => {
      expect(screen.getByTestId('file-too-large')).toBeInTheDocument()
    })
    expect(screen.getByText('Summary unavailable: file too large.')).toBeInTheDocument()
    await waitFor(() => expect(summaryAction.get()?.disabledReason).toBe('file too large'))
  })

  it('renders content via Monaco stub and shows summary', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: 'export const x = 1',
        language: 'typescript',
        summary: { summary: 'Defines x.' },
        summaryStale: false,
        provenance: [{ path: 'src/x.ts', ticketId: 42, jobId: 'job-abcdef123456', kind: 'modified', at: 1000 }],
      }),
    }) as never
    render(wrap(<FileViewer relPath="src/x.ts" />))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-stub')).toBeInTheDocument()
    })
    expect(screen.getByText('Defines x.')).toBeInTheDocument()
    expect(screen.getByTestId('file-provenance-timeline')).toBeInTheDocument()
    expect(screen.getByText('spec #42')).toBeInTheDocument()
    expect(screen.getByText('job-abcdef12')).toBeInTheDocument()
  })

  it('regenerate flow prompts for budget override on skipped=budget', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ content: '', language: 'plaintext', summary: null }) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ skipped: 'budget' }) })
    global.fetch = fetchMock as never
    const summaryAction = captureSummaryAction()
    render(wrap(<FileViewer relPath="src/a.ts" onSummaryActionChange={summaryAction.onChange} />))
    await waitFor(() => expect(summaryAction.get()?.hasSummary).toBe(false))
    await act(async () => { summaryAction.get()?.onClick() })
    await waitFor(() => {
      expect(screen.getByTestId('budget-prompt')).toBeInTheDocument()
    })
  })

  it('ignores WS messages for other projects', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'x', language: 'plaintext', summary: null }),
    }) as never
    render(wrap(<FileViewer relPath="src/a.ts" />))
    await waitFor(() => screen.getByText('No summary for this file yet.'))
    const handler = Array.from(handlers.values())[0]
    expect(handler).toBeDefined()
    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>
    fetchSpy.mockClear()
    act(() => {
      handler?.({ type: 'file.summary_updated', projectId: 'other-project', path: 'src/a.ts' })
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clears generating state when summary_updated arrives', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ content: '', language: 'plaintext', summary: null }) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ enqueued: true }) })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: '',
        language: 'plaintext',
        summary: { summary: 'Fresh summary.' },
        summaryStale: false,
      }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: '',
        language: 'plaintext',
        summary: { summary: 'Fresh summary.' },
        summaryStale: false,
      }),
    })
    global.fetch = fetchMock as never
    const summaryAction = captureSummaryAction()
    render(wrap(<FileViewer relPath="src/a.ts" onSummaryActionChange={summaryAction.onChange} />))
    await waitFor(() => expect(summaryAction.get()?.hasSummary).toBe(false))
    await act(async () => { summaryAction.get()?.onClick() })
    const handler = Array.from(handlers.values())[0]
    act(() => {
      handler?.({ type: 'file.summary_updated', projectId: 'p1', path: 'src/a.ts' })
    })
    await waitFor(() => {
      expect(screen.getByText('Fresh summary.')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(summaryAction.get()?.hasSummary).toBe(true)
      expect(summaryAction.get()?.regenerating).toBe(false)
    })
  })
})
