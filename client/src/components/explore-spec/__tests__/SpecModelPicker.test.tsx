import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../../test-utils'
import { SpecModelPicker, useDefaultSpecModel } from '../SpecModelPicker'
import { renderHook } from '@testing-library/react'

describe('SpecModelPicker', () => {
  it('renders the loading state when loading=true', () => {
    render(
      <SpecModelPicker value={null} allowed={[]} loading={true} onChange={() => {}} />,
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the selected model label when not loading', () => {
    render(
      <SpecModelPicker
        value="opus"
        allowed={[
          { value: 'sonnet', label: 'Claude Sonnet' },
          { value: 'opus', label: 'Claude Opus' },
        ]}
        loading={false}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('Claude Opus')).toBeInTheDocument()
  })

  it('disables the trigger while the allow-list is empty', () => {
    render(
      <SpecModelPicker value={null} allowed={[]} loading={false} onChange={() => {}} />,
    )
    expect(screen.getByTestId('spec-model-picker')).toBeDisabled()
  })
})

describe('useDefaultSpecModel', () => {
  it('fetches and exposes the resolved default + allowed list', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        model: 'opus',
        provider: 'claude',
        allowed: [
          { value: 'sonnet', label: 'Claude Sonnet' },
          { value: 'opus', label: 'Claude Opus' },
        ],
      }),
    })
    const { result } = renderHook(() => useDefaultSpecModel('proj-1', true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.model).toBe('opus')
    expect(result.current.provider).toBe('claude')
    expect(result.current.allowed).toHaveLength(2)
  })

  it('falls back to a safe local list when the endpoint fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    const { result } = renderHook(() => useDefaultSpecModel('proj-1', true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.model).toBe('sonnet')
    expect(result.current.allowed.length).toBeGreaterThan(0)
  })

  it('does nothing while disabled', () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>
    fetchSpy.mockClear()
    renderHook(() => useDefaultSpecModel('proj-1', false))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
