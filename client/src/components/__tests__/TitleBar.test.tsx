/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TitleBar } from '../TitleBar'

const mocks = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  useHub: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    close: mocks.close,
  }),
}))

vi.mock('../../hooks/useHub', () => ({
  useHub: () => mocks.useHub(),
}))

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useHub.mockReturnValue({
      projects: [{ id: 'p1', name: 'Project One' }],
      activeProjectId: 'p1',
    })
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  })

  it('renders nothing outside Tauri', () => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    const { container } = render(<TitleBar />)
    expect(container.firstChild).toBeNull()
  })

  it('uses theme tokens for the macOS overlay titlebar', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    render(<TitleBar />)

    const titlebar = screen.getByLabelText('Search (⌘K)').parentElement as HTMLElement
    expect(titlebar.style.background).toBe('var(--color-background-deep)')
    expect(titlebar.style.borderBottom).toBe('1px solid var(--color-border)')
    expect(screen.getByLabelText('Search (⌘K)')).toHaveStyle({
      color: 'var(--color-foreground)',
    })
  })

  it('uses theme tokens for default window controls', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true })
    render(<TitleBar />)

    const titlebar = screen.getByLabelText('Minimize window').closest('[data-tauri-drag-region]') as HTMLElement
    expect(titlebar.style.background).toBe('var(--color-background-deep)')
    expect(titlebar.style.borderBottom).toBe('1px solid var(--color-border)')
    expect(screen.getByLabelText('Minimize window')).toHaveStyle({
      color: 'var(--color-muted-foreground)',
    })
  })
})
