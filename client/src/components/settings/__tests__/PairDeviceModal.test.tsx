import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { PairDeviceModal } from '../PairDeviceModal'

const QR = {
  v: 1, hub: 'h', name: 'Mac', addrs: ['192.168.1.5'], port: 4202,
  fp: 'a'.repeat(64), secret: 'sec', claimId: 'cid', exp: 9999999999,
}

interface Handler { match: (u: string, m: string) => boolean; ok?: boolean; body?: unknown }
function mockApi(handlers: Handler[]) {
  global.fetch = vi.fn(async (url: unknown, opts?: { method?: string }) => {
    const u = String(url); const m = (opts?.method ?? 'GET').toUpperCase()
    const h = handlers.find((x) => x.match(u, m))
    return { ok: h?.ok ?? true, status: 200, json: async () => h?.body ?? {} } as Response
  }) as never
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.useRealTimers() })

describe('PairDeviceModal', () => {
  it('renders nothing when closed (no pairing session created)', () => {
    mockApi([])
    render(<PairDeviceModal open={false} onClose={() => {}} onPaired={() => {}} />)
    expect(screen.queryByText('Pair a device')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('creates a session and renders the QR + copy affordance', async () => {
    mockApi([
      { match: (u, m) => u.endsWith('/pairing-session') && m === 'POST', body: { qr: QR } },
      { match: (u, m) => u.endsWith('/pairing-session') && m === 'GET', body: { status: 'pending' } },
    ])
    render(<PairDeviceModal open onClose={() => {}} onPaired={() => {}} />)
    await screen.findByText('Pair a device')
    await screen.findByText(/Waiting for a device/)
    expect(screen.getByText(/Copy code/)).toBeInTheDocument()
  })

  it('shows Approve/Deny when the poll reports a claim, and approves', async () => {
    const onPaired = vi.fn()
    mockApi([
      { match: (u, m) => u.endsWith('/pairing-session') && m === 'POST', body: { qr: QR } },
      { match: (u, m) => u.endsWith('/pairing-session/approve') && m === 'POST', body: { ok: true } },
      { match: (u, m) => u.endsWith('/pairing-session') && m === 'GET', body: { status: 'claimed', device: { name: 'iPhone', platform: 'ios' } } },
    ])
    render(<PairDeviceModal open onClose={() => {}} onPaired={onPaired} />)
    // The 2s real-timer poll surfaces the claim → Approve/Deny appear.
    await screen.findByText(/wants to pair/, {}, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onPaired).toHaveBeenCalled())
  }, 8000)
})
