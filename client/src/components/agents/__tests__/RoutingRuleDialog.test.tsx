import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import { RoutingRuleDialog } from '../RoutingRuleDialog'

describe('RoutingRuleDialog', () => {
  it('blocks invalid tags that do not match the profile schema', () => {
    render(
      <RoutingRuleDialog
        open={true}
        chainAgents={['sr-developer', 'custom-data-engineer']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'frontend, Data Engineer' },
    })

    expect(screen.getByText(/invalid tag: Data Engineer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  it('submits trimmed valid kebab-case tags', () => {
    const onConfirm = vi.fn()

    render(
      <RoutingRuleDialog
        open={true}
        chainAgents={['sr-developer', 'custom-data-engineer']}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'frontend, data-engineering' },
    })
    fireEvent.change(screen.getByLabelText('Route to'), {
      target: { value: 'custom-data-engineer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(onConfirm).toHaveBeenCalledWith(
      ['frontend', 'data-engineering'],
      'custom-data-engineer',
    )
  })
})
