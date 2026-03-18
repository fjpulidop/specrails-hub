import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import { StatusBar } from '../StatusBar'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api',
}))

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "connected" text when connectionStatus is connected', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="connected" />)
    expect(screen.getByText('connected')).toBeInTheDocument()
  })

  it('shows "connecting..." text when connectionStatus is connecting', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="connecting" />)
    expect(screen.getByText('connecting...')).toBeInTheDocument()
  })

  it('shows "disconnected" text when connectionStatus is disconnected', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="disconnected" />)
    expect(screen.getByText('disconnected')).toBeInTheDocument()
  })

  it('green indicator is present when connected', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="connected" />)
    const indicator = document.querySelector('.bg-dracula-green')
    expect(indicator).toBeInTheDocument()
  })

  it('orange indicator is present when connecting', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="connecting" />)
    const indicator = document.querySelector('.bg-dracula-orange')
    expect(indicator).toBeInTheDocument()
  })

  it('red indicator is present when disconnected', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StatusBar connectionStatus="disconnected" />)
    const indicator = document.querySelector('.bg-dracula-red')
    expect(indicator).toBeInTheDocument()
  })

  it('fetches and displays stats when available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalJobs: 42,
        jobsToday: 5,
        costToday: 0.25,
        totalCostUsd: 1.50,
      }),
    })
    render(<StatusBar connectionStatus="connected" />)

    await waitFor(() => {
      expect(screen.getByText(/total: 42 jobs/i)).toBeInTheDocument()
    })
    expect(screen.getByText('$1.50')).toBeInTheDocument()
  })

  it('does not show stats when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    render(<StatusBar connectionStatus="connected" />)
    // Wait a tick so the fetch can resolve
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/total:/i)).not.toBeInTheDocument()
  })

  it('does not show cost when totalCostUsd is 0', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalJobs: 10,
        jobsToday: 0,
        costToday: 0,
        totalCostUsd: 0,
      }),
    })
    render(<StatusBar connectionStatus="connected" />)

    await waitFor(() => {
      expect(screen.getByText(/total: 10 jobs/i)).toBeInTheDocument()
    })
    // No dollar amount shown when cost is 0
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument()
  })
})
