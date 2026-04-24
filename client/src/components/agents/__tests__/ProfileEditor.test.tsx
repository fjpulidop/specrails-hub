import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test-utils'
import { ProfileEditor } from '../ProfileEditor'
import type { Profile } from '../types'

function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    schemaVersion: 1,
    name: 'data-heavy',
    description: 'test profile',
    orchestrator: { model: 'sonnet' },
    agents: [
      { id: 'sr-architect', required: true },
      { id: 'sr-developer', required: true },
      { id: 'custom-data-engineer', model: 'sonnet' },
      { id: 'sr-reviewer', required: true },
      { id: 'sr-merge-resolver', required: true },
    ],
    routing: [{ default: true, agent: 'sr-developer' }],
    ...overrides,
  }
}

describe('ProfileEditor', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [] }),
    } as Response)
  })

  it('does not flag untargeted custom agents when routing is empty', async () => {
    const onSoftWarningsChange = vi.fn()

    await act(async () => {
      render(
        <ProfileEditor
          profile={makeProfile({ routing: [] })}
          onChange={vi.fn()}
          onSoftWarningsChange={onSoftWarningsChange}
        />,
      )
    })

    await waitFor(() => {
      expect(onSoftWarningsChange).toHaveBeenCalled()
    })

    expect(onSoftWarningsChange).toHaveBeenLastCalledWith({ agentsMissingRouting: [] })
    expect(screen.queryByText(/untargeted agents in the chain/i)).not.toBeInTheDocument()
  })

  it('locks the default routing rule to sr-developer with no controls', async () => {
    await act(async () => {
      render(<ProfileEditor profile={makeProfile()} onChange={vi.fn()} />)
    })

    // No editable select for the default rule target — it renders as a read-only span.
    expect(screen.queryByRole('combobox', { name: /routing target/i })).not.toBeInTheDocument()
    // A "core · default" badge is rendered.
    expect(screen.getByText(/core · default/i)).toBeInTheDocument()
    // No edit / remove / reorder buttons for the default rule.
    expect(screen.queryByRole('button', { name: /edit rule 1/i })).not.toBeInTheDocument()
  })

  it('edits tags on a tag rule in place via the edit dialog', async () => {
    const onChange = vi.fn()
    const withTagRule = makeProfile({
      routing: [
        { tags: ['frontend'], agent: 'custom-data-engineer' },
        { default: true, agent: 'sr-developer' },
      ],
    })

    await act(async () => {
      render(<ProfileEditor profile={withTagRule} onChange={onChange} />)
    })

    fireEvent.click(screen.getByRole('button', { name: /edit rule 1/i }))
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'frontend, ui' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      routing: [
        { tags: ['frontend', 'ui'], agent: 'custom-data-engineer' },
        { default: true, agent: 'sr-developer' },
      ],
    })
  })
})
