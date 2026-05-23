import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/feature-flags', () => ({ FEATURE_CODE_EXPLORER: true }))
vi.mock('../../../lib/api', () => ({ getApiBase: () => '/api/projects/p1' }))

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import { TicketFilesTouched } from '../TicketFilesTouched'

function setFetch(rows: unknown, opts: { ok?: boolean } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: opts.ok ?? true,
    json: async () => rows,
  }) as never
}

beforeEach(() => {
  navigate.mockClear()
})

describe('TicketFilesTouched', () => {
  it('renders nothing when fetch returns empty array', async () => {
    setFetch([])
    const { container } = render(
      <MemoryRouter><TicketFilesTouched ticketId={42} onClose={() => {}} /></MemoryRouter>,
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('renders rows and navigates on click', async () => {
    setFetch([
      { path: 'src/a.ts', kind: 'created', jobId: 'job-12345678901234', at: 1 },
      { path: 'src/b.ts', kind: 'modified', jobId: null, at: 2 },
      { path: 'src/c.ts', kind: 'deleted', jobId: 'short', at: 3 },
    ])
    const onClose = vi.fn()
    render(
      <MemoryRouter><TicketFilesTouched ticketId={7} onClose={onClose} /></MemoryRouter>,
    )
    await screen.findByText('src/a.ts')
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
    expect(screen.getByText('src/c.ts')).toBeInTheDocument()
    fireEvent.click(screen.getByText('src/a.ts'))
    expect(onClose).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/code?path=src%2Fa.ts')
  })

  it('treats fetch failure as empty', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as never
    const { container } = render(
      <MemoryRouter><TicketFilesTouched ticketId={1} onClose={() => {}} /></MemoryRouter>,
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('treats non-ok response as empty', async () => {
    setFetch([], { ok: false })
    const { container } = render(
      <MemoryRouter><TicketFilesTouched ticketId={1} onClose={() => {}} /></MemoryRouter>,
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
