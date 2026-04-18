/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TerminalTopBar } from '../TerminalTopBar'

function renderBar(overrides: Partial<Parameters<typeof TerminalTopBar>[0]> = {}) {
  const handlers = {
    onCreate: vi.fn(), onKillActive: vi.fn(), onToggleMaximize: vi.fn(), onCollapse: vi.fn(),
  }
  const props = {
    visibility: 'restored' as const,
    canCreate: true,
    hasActive: true,
    ...handlers,
    ...overrides,
  }
  const rendered = render(<TerminalTopBar {...props} />)
  return { ...rendered, ...handlers }
}

describe('TerminalTopBar', () => {
  it('renders Terminal label', () => {
    const { getByText } = renderBar()
    expect(getByText('Terminal')).toBeDefined()
  })

  it('fires onCreate when + clicked', () => {
    const { getByLabelText, onCreate } = renderBar()
    fireEvent.click(getByLabelText(/new terminal/i))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('+ is disabled with tooltip when canCreate is false', () => {
    const { getByLabelText } = renderBar({ canCreate: false })
    const btn = getByLabelText(/max 10 terminals/i)
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('fires onKillActive when trash clicked', () => {
    const { getByLabelText, onKillActive } = renderBar()
    fireEvent.click(getByLabelText(/kill active terminal/i))
    expect(onKillActive).toHaveBeenCalledTimes(1)
  })

  it('trash is disabled when hasActive is false', () => {
    const { getByLabelText } = renderBar({ hasActive: false })
    expect((getByLabelText(/kill active terminal/i) as HTMLButtonElement).disabled).toBe(true)
  })

  it('fires onToggleMaximize when maximize clicked', () => {
    const { getByLabelText, onToggleMaximize } = renderBar()
    fireEvent.click(getByLabelText(/maximize panel/i))
    expect(onToggleMaximize).toHaveBeenCalledTimes(1)
  })

  it('fires onCollapse when chevron clicked', () => {
    const { getByLabelText, onCollapse } = renderBar()
    fireEvent.click(getByLabelText(/collapse terminal panel/i))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows Restore button when maximized', () => {
    const { getByLabelText } = renderBar({ visibility: 'maximized' })
    expect(getByLabelText(/restore panel/i)).toBeDefined()
  })
})
