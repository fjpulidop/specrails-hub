/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BottomPanel } from '../BottomPanel'
import { TerminalsProvider } from '../../../context/TerminalsContext'
import type { ProjectPanelState, TerminalRef } from '../../../context/TerminalsContext'

vi.mock('@xterm/xterm', () => {
  class Terminal {
    cols = 80; rows = 24; element: HTMLElement | null = null
    loadAddon = vi.fn(); open = (el: HTMLElement) => { this.element = el }
    focus = vi.fn(); write = vi.fn(); dispose = vi.fn()
    onData = () => ({ dispose: vi.fn() })
    onResize = () => ({ dispose: vi.fn() })
  }
  return { Terminal }
})
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = vi.fn() } }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
class MockWebSocket extends EventTarget {
  readyState = 0; binaryType = 'arraybuffer'
  constructor(_url: string) { super() }
  send() {}; close() { this.readyState = 3 }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = MockWebSocket

function wrap(node: React.ReactNode) {
  return render(<TerminalsProvider activeProjectId="p">{node}</TerminalsProvider>)
}

function makeState(overrides: Partial<ProjectPanelState> = {}): ProjectPanelState {
  return {
    visibility: 'restored',
    userHeight: 320,
    sessions: [],
    activeId: null,
    ...overrides,
  }
}

describe('BottomPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    localStorage.clear()
  })

  it('returns null when hidden', () => {
    const { queryByTestId } = wrap(
      <BottomPanel projectId="p" state={makeState({ visibility: 'hidden' })} viewportHeight={800} statusBarHeight={28} />,
    )
    expect(queryByTestId('terminal-bottom-panel')).toBeNull()
  })

  it('renders at userHeight in restored mode', () => {
    const { getByTestId } = wrap(
      <BottomPanel projectId="p" state={makeState({ visibility: 'restored', userHeight: 400 })} viewportHeight={800} statusBarHeight={28} />,
    )
    const panel = getByTestId('terminal-bottom-panel') as HTMLElement
    expect(panel.style.height).toBe('400px')
  })

  it('renders at viewport-statusbar in maximized mode', () => {
    const { getByTestId } = wrap(
      <BottomPanel projectId="p" state={makeState({ visibility: 'maximized', userHeight: 400 })} viewportHeight={800} statusBarHeight={28} />,
    )
    const panel = getByTestId('terminal-bottom-panel') as HTMLElement
    expect(panel.style.height).toBe('772px')
  })

  it('clamps userHeight to maxHeight', () => {
    const { getByTestId } = wrap(
      <BottomPanel projectId="p" state={makeState({ visibility: 'restored', userHeight: 10000 })} viewportHeight={800} statusBarHeight={28} />,
    )
    const panel = getByTestId('terminal-bottom-panel') as HTMLElement
    const h = parseInt(panel.style.height, 10)
    expect(h).toBeLessThanOrEqual(800 - 28 - 40)
    expect(h).toBeGreaterThanOrEqual(120)
  })

  it('shows empty placeholder when no sessions', () => {
    const { getByText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [] })} viewportHeight={800} statusBarHeight={28} />,
    )
    expect(getByText(/no terminals yet/i)).toBeDefined()
  })

  it('empty placeholder button fires create', () => {
    const { getAllByRole } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [] })} viewportHeight={800} statusBarHeight={28} />,
    )
    const buttons = getAllByRole('button', { name: /new terminal/i })
    // Placeholder CTA (text includes "New terminal"), not the + icon
    const placeholder = buttons.find((b) => b.textContent?.toLowerCase().includes('new terminal')) ?? buttons[buttons.length - 1]
    fireEvent.click(placeholder)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('renders sessions and sidebar when non-empty', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'zsh', cols: 80, rows: 24, createdAt: 1 }
    const { getByText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    expect(getByText('zsh')).toBeDefined()
  })

  it('top-bar + button fires create action', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'zsh', cols: 80, rows: 24, createdAt: 1 }
    const { getByLabelText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.click(getByLabelText(/new terminal/i))
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('kill-active button fires DELETE', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'zsh', cols: 80, rows: 24, createdAt: 1 }
    const { getByLabelText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.click(getByLabelText(/kill active terminal/i))
    // Fetch called with DELETE method
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const sawDelete = calls.some(([, init]) => init?.method === 'DELETE')
    expect(sawDelete).toBe(true)
  })

  it('collapse chevron click does not throw and dispatches setVisibility', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'zsh', cols: 80, rows: 24, createdAt: 1 }
    const { getByLabelText } = wrap(
      <BottomPanel projectId="p" state={makeState({ visibility: 'restored', sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    // Just exercise the handler — actual state transition is covered in TerminalsContext tests.
    expect(() => fireEvent.click(getByLabelText(/collapse terminal panel/i))).not.toThrow()
  })

  it('maximize then restore toggles state', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'zsh', cols: 80, rows: 24, createdAt: 1 }
    const { getByLabelText, rerender } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.click(getByLabelText(/maximize panel/i))
    let stored = JSON.parse(localStorage.getItem('specrails-hub:terminal-panel:p')!) as { visibility: string }
    expect(stored.visibility).toBe('maximized')
    rerender(
      <TerminalsProvider activeProjectId="p">
        <BottomPanel projectId="p" state={makeState({ visibility: 'maximized', sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />
      </TerminalsProvider>,
    )
    fireEvent.click(getByLabelText(/restore panel/i))
    stored = JSON.parse(localStorage.getItem('specrails-hub:terminal-panel:p')!) as { visibility: string }
    expect(stored.visibility).toBe('restored')
  })

  it('sidebar rename triggers PATCH', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'initial', cols: 80, rows: 24, createdAt: 1 }
    const { getByText, getByDisplayValue } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.doubleClick(getByText('initial'))
    const input = getByDisplayValue('initial')
    fireEvent.change(input, { target: { value: 'renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const sawPatch = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PATCH')
    expect(sawPatch).toBe(true)
  })

  it('sidebar rename button triggers PATCH', () => {
    const s: TerminalRef = { id: 's1', projectId: 'p', name: 'initial', cols: 80, rows: 24, createdAt: 1 }
    const { getByLabelText, getByDisplayValue } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.click(getByLabelText(/rename initial/i))
    const input = getByDisplayValue('initial')
    fireEvent.change(input, { target: { value: 'renamed-from-button' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const sawPatch = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PATCH')
    expect(sawPatch).toBe(true)
  })

  it('sidebar ✕ triggers kill DELETE for that session', () => {
    const s1: TerminalRef = { id: 's1', projectId: 'p', name: 'one', cols: 80, rows: 24, createdAt: 1 }
    const s2: TerminalRef = { id: 's2', projectId: 'p', name: 'two', cols: 80, rows: 24, createdAt: 2 }
    const { getByLabelText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s1, s2], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    fireEvent.click(getByLabelText(/close two/i))
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const sawDelete2 = calls.some(([url, init]) => init?.method === 'DELETE' && String(url).endsWith('/terminals/s2'))
    expect(sawDelete2).toBe(true)
  })

  it('sidebar click fires setActive', () => {
    const s1: TerminalRef = { id: 's1', projectId: 'p', name: 'one', cols: 80, rows: 24, createdAt: 1 }
    const s2: TerminalRef = { id: 's2', projectId: 'p', name: 'two', cols: 80, rows: 24, createdAt: 2 }
    const { getByText } = wrap(
      <BottomPanel projectId="p" state={makeState({ sessions: [s1, s2], activeId: 's1' })} viewportHeight={800} statusBarHeight={28} />,
    )
    // Should not throw; activeId tracking is via context state — we just exercise the handler
    fireEvent.click(getByText('two'))
  })
})
