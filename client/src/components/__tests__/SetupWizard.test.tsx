import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { render } from '../../test-utils'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))

// Mock CheckpointTracker (complex component with its own deps)
vi.mock('../CheckpointTracker', () => ({
  CheckpointTracker: ({ checkpoints }: { checkpoints: { name: string; status: string }[] }) => (
    <div data-testid="checkpoint-tracker">
      {checkpoints.map((cp) => (
        <div key={cp.name} data-testid={`cp-${cp.name.replace(/\s+/g, '-').toLowerCase()}`}>
          {cp.name}: {cp.status}
        </div>
      ))}
    </div>
  ),
}))

// SetupChat mock to avoid markdown complexities in sub-tests
vi.mock('../SetupChat', () => ({
  SetupChat: ({ onSendMessage }: { onSendMessage: (t: string) => void }) => (
    <div data-testid="setup-chat">
      <button onClick={() => onSendMessage('test')}>Send test</button>
    </div>
  ),
}))

let mockRegisterHandler: ReturnType<typeof vi.fn>
let mockUnregisterHandler: ReturnType<typeof vi.fn>

vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: mockRegisterHandler,
    unregisterHandler: mockUnregisterHandler,
    connectionStatus: 'connected',
  }),
}))

import { SetupWizard } from '../SetupWizard'
import type { HubProject } from '../../hooks/useHub'

// Use a counter to ensure unique project IDs — avoids wizardCache cross-test contamination
let projectIdCounter = 0
function makeProject(overrides: Partial<HubProject> = {}): HubProject {
  const id = `proj-setup-${++projectIdCounter}`
  return {
    id,
    slug: 'my-project',
    name: 'My Project',
    path: '/home/user/my-project',
    db_path: `/home/.specrails/projects/${id}/jobs.sqlite`,
    added_at: '2024-01-01T00:00:00.000Z',
    last_seen_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRegisterHandler = vi.fn()
    mockUnregisterHandler = vi.fn()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  describe('Agent-selection step (initial)', () => {
    it('renders agent-selection step by default', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(screen.getByText(/configure your agents/i)).toBeInTheDocument()
    })

    it('shows wizard step indicator labels (quick mode default — no Enrich)', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(screen.getByText('Configure')).toBeInTheDocument()
      expect(screen.getByText('Install')).toBeInTheDocument()
      expect(screen.queryByText('Enrich')).not.toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('renders Skip for now button', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
    })

    it('calls onSkip when Skip is clicked', () => {
      const onSkip = vi.fn()
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={onSkip} />)
      fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
      expect(onSkip).toHaveBeenCalled()
    })

    it('shows tier options in agent-selection step', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(screen.getByText('Quick Setup')).toBeInTheDocument()
      expect(screen.getByText('Full Setup')).toBeInTheDocument()
    })

    it('renders Quick Install button in agent-selection step (default tier is quick)', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Default tier is 'quick', so the button reads "Quick Install"
      expect(screen.getByText('Quick Install')).toBeInTheDocument()
    })

    it('centers the install CTA (quick tier)', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      const wrapper = screen.getByTestId('install-cta-wrapper')
      expect(wrapper).toHaveClass('mx-auto')
      expect(wrapper).toContainElement(screen.getByText('Quick Install'))
    })

    it('Full Setup tier is disabled (coming soon) — clicking does not change tier', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Quick is the default; clicking Full Setup should NOT swap the CTA label.
      fireEvent.click(screen.getByText('Full Setup'))
      expect(screen.getByText('Quick Install')).toBeInTheDocument()
      expect(screen.queryByText('Install & Enrich')).not.toBeInTheDocument()
    })

    it('keeps "Skip for now" left-anchored in the footer', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      const skip = screen.getByText('Skip for now')
      expect(skip.className).toContain('absolute')
      expect(skip.className).toContain('left-')
      // And Skip appears before the centered install wrapper in DOM order.
      const wrapper = screen.getByTestId('install-cta-wrapper')
      expect(skip.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('Transition to installing step', () => {
    it('transitions to installing step when Install button is clicked', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => {
        expect(screen.getByText(/installing specrails/i)).toBeInTheDocument()
      })
    })

    it('calls POST /setup/install when Install is clicked', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/projects/${project.id}/setup/install`,
          expect.objectContaining({ method: 'POST' })
        )
      })
    })

    it('shows "Waiting for output..." when no log lines yet', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => {
        expect(screen.getByText(/waiting for output/i)).toBeInTheDocument()
      })
    })
  })

  describe('WebSocket registration', () => {
    it('registers WebSocket handler on mount', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(mockRegisterHandler).toHaveBeenCalledWith(
        `setup-${project.id}`,
        expect.any(Function)
      )
    })

    it('unregisters WebSocket handler on unmount', () => {
      const project = makeProject()
      const { unmount } = render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      unmount()
      expect(mockUnregisterHandler).toHaveBeenCalledWith(`setup-${project.id}`)
    })
  })

  describe('WebSocket message handling', () => {
    function getWsHandler() {
      return mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
    }

    it('appends log lines on setup_log message', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Move to installing step
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_log', projectId: project.id, line: 'Installing packages...' })
      })

      await waitFor(() => {
        expect(screen.getByText('Installing packages...')).toBeInTheDocument()
      })
    })

    it('ignores messages from different projectId', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_log', projectId: 'OTHER-PROJECT', line: 'Should not appear' })
      })

      expect(screen.queryByText('Should not appear')).toBeNull()
    })

    it.skip('[full-tier gated] transitions to enriching step on setup_install_done (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Switch to full tier so install_done transitions to enriching
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })

      await waitFor(() => {
        expect(screen.getByTestId('checkpoint-tracker')).toBeInTheDocument()
      })
    })

    it.skip('[full-tier gated] marks complete on setup_complete message (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Switch to full tier
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      act(() => {
        handler({
          type: 'setup_complete',
          projectId: project.id,
          summary: { agents: 3, specrailsCommands: 5, opsxCommands: 2, personas: 2, legacySrRemoved: 0, tier: 'full' },
        })
      })

      await waitFor(() => {
        expect(screen.getByText(/welcome to/i)).toBeInTheDocument()
      })
    })

    it('shows error step on setup_error message', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_error', projectId: project.id, error: 'npx failed' })
      })

      await waitFor(() => {
        expect(screen.getByText('Setup failed')).toBeInTheDocument()
        expect(screen.getByText('npx failed')).toBeInTheDocument()
      })
    })

    it.skip('[full-tier gated] updates checkpoint status on setup_checkpoint message (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Switch to full tier so install_done transitions to enriching
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())

      const handler = getWsHandler()
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      await waitFor(() => expect(screen.getByTestId('checkpoint-tracker')).toBeInTheDocument())

      act(() => {
        handler({ type: 'setup_checkpoint', projectId: project.id, checkpoint: 'base_install', status: 'done' })
      })

      await waitFor(() => {
        expect(screen.getByTestId('cp-base-installation')).toHaveTextContent('done')
      })
    })
  })

  describe('Error step', () => {
    async function renderErrorStep() {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      act(() => {
        handler({ type: 'setup_error', projectId: project.id, error: 'Connection timed out' })
      })
      await waitFor(() => expect(screen.getByText('Setup failed')).toBeInTheDocument())
      return { handler, project }
    }

    it('renders Retry and Skip setup buttons', async () => {
      await renderErrorStep()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /skip setup/i })).toBeInTheDocument()
    })

    it('shows error message in error step', async () => {
      await renderErrorStep()
      expect(screen.getByText('Connection timed out')).toBeInTheDocument()
    })

    it('goes back to installing when Retry is clicked', async () => {
      await renderErrorStep()
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      // After retry, we're back in installing (or fetching). The error step should be gone.
      await waitFor(() => {
        expect(screen.queryByText('Setup failed')).toBeNull()
      })
    })
  })

  describe('Back navigation', () => {
    it('proposal step does not show a Back button', () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument()
    })

    it('installing step shows a Back button', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument()
      })
    })

    it('Back button in installing step returns to agent-selection', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Quick Install'))
      await waitFor(() => expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
      await waitFor(() => {
        expect(screen.getByText(/configure your agents/i)).toBeInTheDocument()
      })
    })

    it.skip('[full-tier gated] enriching step shows a Back button (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      await waitFor(() => expect(screen.getByTestId('checkpoint-tracker')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument()
    })

    it.skip('[full-tier gated] Back button in enriching step returns to installing (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      await waitFor(() => expect(screen.getByTestId('checkpoint-tracker')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
      await waitFor(() => {
        expect(screen.getByText(/installing specrails/i)).toBeInTheDocument()
      })
    })

    it.skip('[full-tier gated] user input in setup chat is preserved when navigating back and forward (full tier)', async () => {
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      // Add some log lines
      act(() => {
        handler({ type: 'setup_log', projectId: project.id, line: 'Installing...' })
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      await waitFor(() => expect(screen.getByTestId('checkpoint-tracker')).toBeInTheDocument())
      // Go back to installing — log lines should still be there
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
      await waitFor(() => {
        expect(screen.getByText('Installing...')).toBeInTheDocument()
      })
    })
  })

  // All "Complete step" tests exercise the full-tier enrich path, which is
  // temporarily gated (UI "Coming soon"). Skipped until Full Setup is released.
  describe.skip('[full-tier gated] Complete step', () => {
    type SummaryOverride = {
      agents?: number
      specrailsCommands?: number
      opsxCommands?: number
      personas?: number
      legacySrRemoved?: number
      tier?: 'quick' | 'full'
    }

    async function renderCompleteStep(summaryOverride: SummaryOverride = {}) {
      const summary = {
        agents: 4,
        specrailsCommands: 8,
        opsxCommands: 3,
        personas: 3,
        legacySrRemoved: 0,
        tier: 'full' as const,
        ...summaryOverride,
      }
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={vi.fn()} onSkip={vi.fn()} />)
      // Switch to full tier so install_done transitions to enriching, then complete
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      act(() => {
        handler({ type: 'setup_complete', projectId: project.id, summary })
      })
      await waitFor(() => expect(screen.getByText(/welcome to/i)).toBeInTheDocument())
      return { handler, project }
    }

    it('shows summary stats', async () => {
      await renderCompleteStep({ agents: 7, specrailsCommands: 12, opsxCommands: 5, personas: 6, tier: 'full' })
      // Use unique numbers that won't clash with step indicators (1-4)
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('6')).toBeInTheDocument()
    })

    it('shows Agents, /specrails:*, /opsx:* labels and never Spec', async () => {
      await renderCompleteStep()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('/specrails:*')).toBeInTheDocument()
      expect(screen.getByText('/opsx:*')).toBeInTheDocument()
      expect(screen.queryByText('Spec')).not.toBeInTheDocument()
    })

    it('renders Continue to project button', async () => {
      await renderCompleteStep()
      expect(screen.getByRole('button', { name: /continue to project/i })).toBeInTheDocument()
    })

    it('calls onComplete when Continue is clicked', async () => {
      const onComplete = vi.fn()
      const project = makeProject()
      render(<SetupWizard project={project} onComplete={onComplete} onSkip={vi.fn()} />)
      // Switch to full tier so install_done transitions to enriching, then complete
      fireEvent.click(screen.getByText('Full Setup'))
      fireEvent.click(screen.getByText('Install & Enrich'))
      await waitFor(() => expect(screen.getByText(/installing specrails/i)).toBeInTheDocument())
      const handler = mockRegisterHandler.mock.calls[0][1] as (msg: unknown) => void
      act(() => {
        handler({ type: 'setup_install_done', projectId: project.id })
      })
      act(() => {
        handler({
          type: 'setup_complete',
          projectId: project.id,
          summary: { agents: 1, specrailsCommands: 5, opsxCommands: 2, personas: 0, legacySrRemoved: 0, tier: 'quick' },
        })
      })
      await waitFor(() => expect(screen.getByRole('button', { name: /continue to project/i })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /continue to project/i }))
      expect(onComplete).toHaveBeenCalled()
    })

    it('shows project name in complete step', async () => {
      await renderCompleteStep()
      expect(screen.getAllByText('My Project').length).toBeGreaterThanOrEqual(1)
    })

    it('renders specrails docs link', async () => {
      await renderCompleteStep()
      const docsLink = document.querySelector('a[href="https://specrails.dev/docs"]')
      expect(docsLink).toBeTruthy()
    })

    it('quick tier renders three tiles and no Personas tile', async () => {
      await renderCompleteStep({ tier: 'quick', personas: 0 })
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('/specrails:*')).toBeInTheDocument()
      expect(screen.getByText('/opsx:*')).toBeInTheDocument()
      expect(screen.queryByText('Personas')).not.toBeInTheDocument()
    })

    it('full tier with personas > 0 renders four tiles including Personas', async () => {
      await renderCompleteStep({ tier: 'full', personas: 3 })
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('/specrails:*')).toBeInTheDocument()
      expect(screen.getByText('/opsx:*')).toBeInTheDocument()
      expect(screen.getByText('Personas')).toBeInTheDocument()
    })

    it('full tier with zero personas renders three tiles and no Personas tile', async () => {
      await renderCompleteStep({ tier: 'full', personas: 0 })
      expect(screen.queryByText('Personas')).not.toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('/specrails:*')).toBeInTheDocument()
      expect(screen.getByText('/opsx:*')).toBeInTheDocument()
    })

    it('renders legacy cleanup notice when legacySrRemoved > 0', async () => {
      await renderCompleteStep({ legacySrRemoved: 2 })
      expect(screen.getByText(/removed 2 legacy/i)).toBeInTheDocument()
    })

    it('does not render legacy cleanup notice when legacySrRemoved === 0', async () => {
      await renderCompleteStep({ legacySrRemoved: 0 })
      expect(screen.queryByText(/legacy.*sr/i)).not.toBeInTheDocument()
    })

    it('never renders a tile labelled Spec', async () => {
      await renderCompleteStep({ tier: 'full', personas: 3 })
      expect(screen.queryByText('Spec')).not.toBeInTheDocument()
    })
  })
})
