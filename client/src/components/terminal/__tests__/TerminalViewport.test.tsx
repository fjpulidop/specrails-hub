/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TerminalViewport } from '../TerminalViewport'
import { TerminalsProvider } from '../../../context/TerminalsContext'

vi.mock('@xterm/xterm', () => {
  class Terminal {
    cols = 80; rows = 24; element: HTMLElement | null = null
    loadAddon = vi.fn(); open = vi.fn(); focus = vi.fn(); dispose = vi.fn()
    write = vi.fn(); onData = () => ({ dispose: vi.fn() }); onResize = () => ({ dispose: vi.fn() })
  }
  return { Terminal }
})
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = vi.fn() } }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
class MockWebSocket extends EventTarget {
  readyState = 0; binaryType = 'arraybuffer'
  constructor(_: string) { super() }
  send() {} close() { this.readyState = 3 }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = MockWebSocket

describe('TerminalViewport', () => {
  it('renders a slot element', () => {
    const { container } = render(
      <TerminalsProvider activeProjectId="p">
        <TerminalViewport activeId={null} />
      </TerminalsProvider>,
    )
    expect(container.querySelector('[data-terminal-viewport]')).toBeTruthy()
  })

  it('returns without error when activeId has no container yet', () => {
    const { container } = render(
      <TerminalsProvider activeProjectId="p">
        <TerminalViewport activeId="missing-id" />
      </TerminalsProvider>,
    )
    expect(container.querySelector('[data-terminal-viewport]')).toBeTruthy()
  })
})
