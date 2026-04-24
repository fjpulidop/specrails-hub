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

  it('lets the user retarget the default rule to a custom agent', async () => {
    const onChange = vi.fn()

    await act(async () => {
      render(<ProfileEditor profile={makeProfile()} onChange={onChange} />)
    })

    expect(screen.getByText(/untargeted agents in the chain/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Default routing target'), {
      target: { value: 'custom-data-engineer' },
    })

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      routing: [{ default: true, agent: 'custom-data-engineer' }],
    })
  })
})
