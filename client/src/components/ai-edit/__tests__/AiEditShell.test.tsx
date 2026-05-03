import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AiEditShell } from '../AiEditShell'

function renderShell(overrides: Partial<React.ComponentProps<typeof AiEditShell>> = {}) {
  return render(
    <AiEditShell
      uiPhase="composing"
      eyebrow="AI Edit"
      targetLabel="sr-developer"
      headline="Refine your agent"
      streamingHeadline="Refining…"
      composer={<textarea data-testid="composer" />}
      canApply={false}
      onApply={vi.fn()}
      onDiscard={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
}

describe('AiEditShell minimize button', () => {
  it('does not render the minimize button when onMinimize is omitted', () => {
    renderShell()
    expect(screen.queryByTestId('ai-edit-minimize')).toBeNull()
  })

  it('renders the minimize button and fires onMinimize on click', () => {
    const onMinimize = vi.fn()
    renderShell({ onMinimize })
    fireEvent.click(screen.getByTestId('ai-edit-minimize'))
    expect(onMinimize).toHaveBeenCalledTimes(1)
  })

  it('minimize never opens the discard-confirm dialog (non-destructive)', () => {
    const onMinimize = vi.fn()
    const onDiscard = vi.fn()
    renderShell({ onMinimize, onDiscard, uiPhase: 'streaming' })
    fireEvent.click(screen.getByTestId('ai-edit-minimize'))
    expect(screen.queryByText(/Discard refinement/i)).toBeNull()
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
