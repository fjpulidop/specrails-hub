import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test-utils'
import { Navbar } from '../Navbar'

function findLink(href: string): HTMLElement | undefined {
  return screen.getAllByRole('link').find((l) => l.getAttribute('href') === href)
}

describe('Navbar (extended: active routes + CLI badge)', () => {
  it('marks the Analytics link active (and Home inactive) on /analytics', () => {
    render(<Navbar />, { route: '/analytics' })
    // toHaveClass is token-based: 'bg-accent' never matches 'hover:bg-accent'
    const analytics = screen.getByRole('link', { name: /analytics/i })
    expect(analytics).toHaveClass('bg-accent')
    expect(analytics).toHaveClass('text-foreground')

    const home = screen.getByRole('link', { name: /home/i })
    expect(home).toHaveClass('text-muted-foreground')
    expect(home).not.toHaveClass('bg-accent')
  })

  it('marks the Home link active on /', () => {
    render(<Navbar />, { route: '/' })
    const home = screen.getByRole('link', { name: /home/i })
    expect(home).toHaveClass('bg-accent')

    const analytics = screen.getByRole('link', { name: /analytics/i })
    expect(analytics).not.toHaveClass('bg-accent')
  })

  it('still renders the Settings link on /settings', () => {
    // NOTE: the Settings NavLink is wrapped in Radix `TooltipTrigger asChild`,
    // whose Slot stringifies function-form `className` props before NavLink can
    // invoke them — so the active/inactive callback (Navbar.tsx:129-135) never
    // runs and cannot be covered without a source change. We only assert the
    // link itself renders.
    render(<Navbar />, { route: '/settings' })
    expect(findLink('/settings')).toBeDefined()
  })

  it('renders the Claude Code badge with version when the CLI status reports claude', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'claude', version: '2.1.0' }),
    }) as unknown as typeof fetch
    render(<Navbar />)
    expect(await screen.findByText('Claude Code v2.1.0')).toBeInTheDocument()
  })

  it('renders the Codex CLI badge without version when version is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'codex', version: null }),
    }) as unknown as typeof fetch
    render(<Navbar />)
    expect(await screen.findByText('Codex CLI')).toBeInTheDocument()
  })

  it('renders the No AI CLI badge when the status fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    render(<Navbar />)
    expect(await screen.findByText('No AI CLI')).toBeInTheDocument()
  })
})
