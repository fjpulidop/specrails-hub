/**
 * CommandGrid component tests — Discovery & Delivery sections
 *
 * NOTE: These tests require client-side test infrastructure that is not yet
 * installed.  To make them runnable, add to client/package.json devDependencies:
 *   - @testing-library/react ^14
 *   - @testing-library/jest-dom ^6
 *   - @testing-library/user-event ^14
 *   - jsdom (or happy-dom) — vitest environment
 *
 * Then add a vitest config for the client (e.g., vitest.config.client.ts):
 *
 *   import { defineConfig } from 'vitest/config'
 *   import react from '@vitejs/plugin-react'
 *   export default defineConfig({
 *     plugins: [react()],
 *     test: {
 *       include: ['client/src/**\/*.test.tsx', 'client/src/**\/*.test.ts'],
 *       environment: 'jsdom',
 *       globals: true,
 *       setupFiles: ['client/src/test-setup.ts'],
 *     },
 *   })
 *
 * Until that infrastructure is in place, the pure-logic coverage lives in:
 *   server/command-grid-logic.test.ts
 * which runs under the existing Node/vitest configuration and covers all
 * ordering, filtering, and display-name behaviour without a DOM.
 *
 * ----- FULL COMPONENT TEST SUITE (requires infrastructure above) ----------
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandGrid } from './CommandGrid'
import type { CommandInfo } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock sonner so toast.promise doesn't blow up in jsdom
vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock getApiBase — the component only uses it inside click handlers
vi.mock('../lib/api', () => ({
  getApiBase: () => '/api',
}))

// Stub global fetch so spawnCommand doesn't hit the network
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: 'test-job-id' }),
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cmd(slug: string, overrides: Partial<CommandInfo> = {}): CommandInfo {
  return {
    id:          `id-${slug}`,
    name:        slug,
    description: `Description of ${slug}`,
    slug,
    ...overrides,
  }
}

const ALL_COMMANDS: CommandInfo[] = [
  cmd('propose-spec',                  { name: 'Propose Spec' }),
  cmd('update-product-driven-backlog', { name: 'Update Backlog' }),
  cmd('product-backlog',               { name: 'Product Backlog' }),
  cmd('implement',                     { name: 'Implement' }),
  cmd('batch-implement',               { name: 'Batch Implement' }),
  cmd('propose-feature',               { name: 'Propose Feature' }),   // hidden
  cmd('refactor-recommender',          { name: 'Refactor Recommender' }),
  cmd('health-check',                  { name: 'Health Check' }),
]

const onOpenWizard = vi.fn()

function renderGrid(commands: CommandInfo[] = ALL_COMMANDS) {
  return render(<CommandGrid commands={commands} onOpenWizard={onOpenWizard} />)
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

describe('CommandGrid rendering', () => {
  it('renders without crashing', () => {
    renderGrid()
  })

  it('shows empty state when no commands provided', () => {
    renderGrid([])
    expect(screen.getByText(/No commands found/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

describe('Section headers', () => {
  it('renders Discovery section header', () => {
    renderGrid()
    expect(screen.getByText('DISCOVERY')).toBeInTheDocument()
  })

  it('renders Delivery section header', () => {
    renderGrid()
    expect(screen.getByText('DELIVERY')).toBeInTheDocument()
  })

  it('does not render Others header when there are no other commands', () => {
    const discoveryAndDelivery = ALL_COMMANDS.filter(
      (c) => ['propose-spec', 'update-product-driven-backlog', 'product-backlog', 'implement', 'batch-implement'].includes(c.slug)
    )
    renderGrid(discoveryAndDelivery)
    expect(screen.queryByText(/Others/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Discovery section — order
// ---------------------------------------------------------------------------

describe('Discovery section — command order', () => {
  it('propose-spec is the first Discovery item', () => {
    renderGrid()
    const section = screen.getByText('DISCOVERY').closest('[class*="space-y"]') ?? document.body
    const buttons = within(section as HTMLElement).getAllByRole('button')
    // The first visible button in the Discovery section corresponds to propose-spec
    // (display name falls back to cmd.name = 'Propose Spec')
    expect(buttons[0]).toHaveTextContent('Propose Spec')
  })

  it('update-product-driven-backlog is the second Discovery item', () => {
    renderGrid()
    const section = screen.getByText('DISCOVERY').closest('[class*="space-y"]') ?? document.body
    const buttons = within(section as HTMLElement).getAllByRole('button')
    expect(buttons[1]).toHaveTextContent('Auto-propose Specs')
  })

  it('product-backlog is the third Discovery item', () => {
    renderGrid()
    const section = screen.getByText('DISCOVERY').closest('[class*="space-y"]') ?? document.body
    const buttons = within(section as HTMLElement).getAllByRole('button')
    expect(buttons[2]).toHaveTextContent('Auto-Select Specs')
  })
})

// ---------------------------------------------------------------------------
// Delivery section — order
// ---------------------------------------------------------------------------

describe('Delivery section — command order', () => {
  it('implement appears before batch-implement', () => {
    renderGrid()
    const allButtons = screen.getAllByRole('button')
    const implementIdx    = allButtons.findIndex((b) => b.textContent?.includes('Implement') && !b.textContent?.includes('Batch'))
    const batchImplIdx    = allButtons.findIndex((b) => b.textContent?.includes('Batch Implement'))
    expect(implementIdx).toBeLessThan(batchImplIdx)
  })
})

// ---------------------------------------------------------------------------
// HIDDEN_SLUGS — propose-feature must not appear
// ---------------------------------------------------------------------------

describe('propose-feature is hidden', () => {
  it('does not render a button labelled Propose Feature', () => {
    renderGrid(ALL_COMMANDS)
    expect(screen.queryByText('Propose Feature')).toBeNull()
  })

  it('does not render any element with text containing propose-feature', () => {
    renderGrid(ALL_COMMANDS)
    // Check visible text — the slug should not appear anywhere
    expect(screen.queryByText(/propose-feature/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Display name overrides
// ---------------------------------------------------------------------------

describe('Display name overrides', () => {
  it('update-product-driven-backlog displays as "Auto-propose Specs"', () => {
    renderGrid()
    expect(screen.getByText('Auto-propose Specs')).toBeInTheDocument()
  })

  it('product-backlog displays as "Auto-Select Specs"', () => {
    renderGrid()
    expect(screen.getByText('Auto-Select Specs')).toBeInTheDocument()
  })

  it('"Update Backlog" (raw name) is not shown for update-product-driven-backlog', () => {
    renderGrid()
    expect(screen.queryByText('Update Backlog')).toBeNull()
  })

  it('"Product Backlog" (raw name) is not shown for product-backlog', () => {
    renderGrid()
    expect(screen.queryByText('Product Backlog')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tooltips — must show /sr:<slug>, not the display name
// ---------------------------------------------------------------------------

describe('Tooltips show real /sr:<slug> command', () => {
  it('update-product-driven-backlog tooltip contains /sr:update-product-driven-backlog', async () => {
    const user = userEvent.setup()
    renderGrid()
    const button = screen.getByRole('button', { name: /Auto-propose Specs/i })
    await user.hover(button)
    expect(screen.getByText('/sr:update-product-driven-backlog')).toBeInTheDocument()
  })

  it('product-backlog tooltip contains /sr:product-backlog', async () => {
    const user = userEvent.setup()
    renderGrid()
    const button = screen.getByRole('button', { name: /Auto-Select Specs/i })
    await user.hover(button)
    expect(screen.getByText('/sr:product-backlog')).toBeInTheDocument()
  })

  it('tooltip does NOT contain the display name override for update-product-driven-backlog', async () => {
    const user = userEvent.setup()
    renderGrid()
    const button = screen.getByRole('button', { name: /Auto-propose Specs/i })
    await user.hover(button)
    // The tooltip text should be the slug, not "Auto-propose Specs"
    const tooltip = screen.queryByText('/sr:Auto-propose Specs')
    expect(tooltip).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Others section
// ---------------------------------------------------------------------------

describe('Others section', () => {
  it('Others header is collapsed by default', () => {
    renderGrid()
    // The others section header is a collapsible button; its children grid is hidden
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    expect(othersBtn).toBeInTheDocument()
    // refactor-recommender should NOT be visible yet
    expect(screen.queryByText('Refactor Recommender')).toBeNull()
  })

  it('clicking Others header expands the section', async () => {
    const user = userEvent.setup()
    renderGrid()
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    await user.click(othersBtn)
    expect(screen.getByText('Refactor Recommender')).toBeInTheDocument()
    expect(screen.getByText('Health Check')).toBeInTheDocument()
  })

  it('Discovery commands do not appear in Others', async () => {
    const user = userEvent.setup()
    renderGrid()
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    await user.click(othersBtn)
    // After expansion, propose-spec should appear only once (in Discovery)
    const proposeCells = screen.queryAllByText('Propose Spec')
    // It should appear exactly once — in Discovery, not duplicated in Others
    expect(proposeCells).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Wizard commands open wizard, non-wizard commands spawn
// ---------------------------------------------------------------------------

describe('Click behaviour', () => {
  beforeEach(() => {
    onOpenWizard.mockClear()
  })

  it('clicking implement calls onOpenWizard("implement")', async () => {
    const user = userEvent.setup()
    renderGrid()
    const btn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Implement') && !b.textContent?.includes('Batch'))
    expect(btn).toBeDefined()
    await user.click(btn!)
    expect(onOpenWizard).toHaveBeenCalledWith('implement')
  })

  it('clicking batch-implement calls onOpenWizard("batch-implement")', async () => {
    const user = userEvent.setup()
    renderGrid()
    const btn = screen.getByRole('button', { name: /Batch Implement/i })
    await user.click(btn)
    expect(onOpenWizard).toHaveBeenCalledWith('batch-implement')
  })

  it('clicking propose-spec does NOT call onOpenWizard', async () => {
    const user = userEvent.setup()
    renderGrid()
    const btn = screen.getByRole('button', { name: /Propose Spec/i })
    await user.click(btn)
    expect(onOpenWizard).not.toHaveBeenCalled()
  })
})
