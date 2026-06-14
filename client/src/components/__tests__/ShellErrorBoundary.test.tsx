import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { ShellErrorBoundary } from '../ShellErrorBoundary'

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error('kaboom-detail')
  return <div>shell content</div>
}

describe('ShellErrorBoundary', () => {
  it('renders a recovery fallback on a child crash, then recovers on Retry', () => {
    const { rerender } = render(
      <ShellErrorBoundary>
        <Boom crash />
      </ShellErrorBoundary>,
    )
    // Fallback shown; the crashing child is not rendered, and the error surfaces.
    expect(screen.queryByText('shell content')).not.toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('kaboom-detail')).toBeInTheDocument()

    // Fix the underlying cause, then Retry → the boundary resets and renders it.
    rerender(
      <ShellErrorBoundary>
        <Boom crash={false} />
      </ShellErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('shell content')).toBeInTheDocument()
  })

  it('offers a Close action that calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ShellErrorBoundary onClose={onClose}>
        <Boom crash />
      </ShellErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes children through untouched when nothing throws', () => {
    render(
      <ShellErrorBoundary>
        <Boom crash={false} />
      </ShellErrorBoundary>,
    )
    expect(screen.getByText('shell content')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
