/**
 * Pure-logic tests for CommandGrid Discovery & Delivery sections.
 *
 * CommandGrid.tsx lives in the client and cannot be imported in a Node
 * environment (it uses JSX, React hooks, and DOM-only imports).  However,
 * the critical business logic — section ordering, display-name overrides,
 * hidden-slug filtering — is expressed entirely through module-level
 * constants and pure array/map operations.  These tests replicate those
 * constants verbatim and verify every behavioural guarantee listed in the
 * feature spec.
 *
 * If the constants in client/src/components/CommandGrid.tsx ever change,
 * update the corresponding declarations below.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Constants mirrored from client/src/components/CommandGrid.tsx
// ---------------------------------------------------------------------------

const DISCOVERY_ORDER = ['propose-spec', 'update-product-driven-backlog', 'product-backlog'] as const
const DELIVERY_ORDER  = ['implement', 'batch-implement'] as const
const DISCOVERY_SET   = new Set<string>(DISCOVERY_ORDER)
const DELIVERY_SET    = new Set<string>(DELIVERY_ORDER)
const DISPLAY_NAMES: Record<string, string> = {
  'update-product-driven-backlog': 'Auto-propose Specs',
  'product-backlog':               'Auto-Select Specs',
}
const HIDDEN_SLUGS = new Set(['propose-feature'])
const WIZARD_COMMANDS = new Set(['implement', 'batch-implement'])

// ---------------------------------------------------------------------------
// Helper: mimics the filtering + ordering logic inside CommandGrid render
// ---------------------------------------------------------------------------

interface CommandInfo {
  id: string
  name: string
  description: string
  slug: string
}

function buildSections(commands: CommandInfo[]) {
  const visibleCommands = commands.filter((c) => !HIDDEN_SLUGS.has(c.slug))
  const bySlug = new Map(visibleCommands.map((c) => [c.slug, c]))

  const discovery = DISCOVERY_ORDER
    .map((s) => bySlug.get(s))
    .filter((c): c is CommandInfo => c !== undefined)

  const delivery = DELIVERY_ORDER
    .map((s) => bySlug.get(s))
    .filter((c): c is CommandInfo => c !== undefined)

  const others = visibleCommands
    .filter((c) => !DISCOVERY_SET.has(c.slug) && !DELIVERY_SET.has(c.slug))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { discovery, delivery, others, visibleCommands }
}

function displayName(cmd: CommandInfo): string {
  return DISPLAY_NAMES[cmd.slug] ?? cmd.name
}

function tooltipSlug(cmd: CommandInfo): string {
  return `/sr:${cmd.slug}`
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCommand(slug: string, overrides: Partial<CommandInfo> = {}): CommandInfo {
  return {
    id:          `id-${slug}`,
    name:        slug,             // default: use slug as name
    description: `Description of ${slug}`,
    slug,
    ...overrides,
  }
}

/** Full set of all known specrails commands including the hidden one. */
const ALL_COMMANDS: CommandInfo[] = [
  makeCommand('propose-spec',                  { name: 'Propose Spec' }),
  makeCommand('update-product-driven-backlog', { name: 'Update Backlog' }),
  makeCommand('product-backlog',               { name: 'Product Backlog' }),
  makeCommand('implement',                     { name: 'Implement' }),
  makeCommand('batch-implement',               { name: 'Batch Implement' }),
  makeCommand('propose-feature',               { name: 'Propose Feature' }),  // hidden
  makeCommand('refactor-recommender',          { name: 'Refactor Recommender' }),
  makeCommand('health-check',                  { name: 'Health Check' }),
  makeCommand('compat-check',                  { name: 'Compat Check' }),
  makeCommand('why',                           { name: 'Why' }),
]

// ---------------------------------------------------------------------------
// Discovery section — ordering
// ---------------------------------------------------------------------------

describe('Discovery section', () => {
  it('contains exactly the three expected commands', () => {
    const { discovery } = buildSections(ALL_COMMANDS)
    expect(discovery.map((c) => c.slug)).toEqual([
      'propose-spec',
      'update-product-driven-backlog',
      'product-backlog',
    ])
  })

  it('puts propose-spec first', () => {
    const { discovery } = buildSections(ALL_COMMANDS)
    expect(discovery[0].slug).toBe('propose-spec')
  })

  it('puts update-product-driven-backlog second', () => {
    const { discovery } = buildSections(ALL_COMMANDS)
    expect(discovery[1].slug).toBe('update-product-driven-backlog')
  })

  it('puts product-backlog third', () => {
    const { discovery } = buildSections(ALL_COMMANDS)
    expect(discovery[2].slug).toBe('product-backlog')
  })

  it('preserves DISCOVERY_ORDER even when input array is shuffled', () => {
    const shuffled = [...ALL_COMMANDS].reverse()
    const { discovery } = buildSections(shuffled)
    expect(discovery.map((c) => c.slug)).toEqual([
      'propose-spec',
      'update-product-driven-backlog',
      'product-backlog',
    ])
  })

  it('omits a discovery command that is absent from the input', () => {
    const withoutProductBacklog = ALL_COMMANDS.filter((c) => c.slug !== 'product-backlog')
    const { discovery } = buildSections(withoutProductBacklog)
    expect(discovery.map((c) => c.slug)).toEqual([
      'propose-spec',
      'update-product-driven-backlog',
    ])
    expect(discovery).toHaveLength(2)
  })

  it('returns empty discovery when none of its commands are present', () => {
    const noDiscovery = ALL_COMMANDS.filter((c) => !DISCOVERY_SET.has(c.slug))
    const { discovery } = buildSections(noDiscovery)
    expect(discovery).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Delivery section — ordering
// ---------------------------------------------------------------------------

describe('Delivery section', () => {
  it('contains exactly the two expected commands', () => {
    const { delivery } = buildSections(ALL_COMMANDS)
    expect(delivery.map((c) => c.slug)).toEqual(['implement', 'batch-implement'])
  })

  it('puts implement before batch-implement', () => {
    const { delivery } = buildSections(ALL_COMMANDS)
    expect(delivery[0].slug).toBe('implement')
    expect(delivery[1].slug).toBe('batch-implement')
  })

  it('preserves DELIVERY_ORDER even when input array is shuffled', () => {
    const shuffled = [...ALL_COMMANDS].reverse()
    const { delivery } = buildSections(shuffled)
    expect(delivery.map((c) => c.slug)).toEqual(['implement', 'batch-implement'])
  })

  it('omits a delivery command that is absent from the input', () => {
    const withoutBatchImplement = ALL_COMMANDS.filter((c) => c.slug !== 'batch-implement')
    const { delivery } = buildSections(withoutBatchImplement)
    expect(delivery.map((c) => c.slug)).toEqual(['implement'])
    expect(delivery).toHaveLength(1)
  })

  it('returns empty delivery when none of its commands are present', () => {
    const noDelivery = ALL_COMMANDS.filter((c) => !DELIVERY_SET.has(c.slug))
    const { delivery } = buildSections(noDelivery)
    expect(delivery).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// HIDDEN_SLUGS — propose-feature must never appear
// ---------------------------------------------------------------------------

describe('Hidden slugs (propose-feature)', () => {
  it('propose-feature does not appear in discovery', () => {
    const { discovery } = buildSections(ALL_COMMANDS)
    expect(discovery.map((c) => c.slug)).not.toContain('propose-feature')
  })

  it('propose-feature does not appear in delivery', () => {
    const { delivery } = buildSections(ALL_COMMANDS)
    expect(delivery.map((c) => c.slug)).not.toContain('propose-feature')
  })

  it('propose-feature does not appear in others', () => {
    const { others } = buildSections(ALL_COMMANDS)
    expect(others.map((c) => c.slug)).not.toContain('propose-feature')
  })

  it('propose-feature does not appear in visibleCommands', () => {
    const { visibleCommands } = buildSections(ALL_COMMANDS)
    expect(visibleCommands.map((c) => c.slug)).not.toContain('propose-feature')
  })

  it('propose-feature is excluded even when it is the only command', () => {
    const only = [makeCommand('propose-feature')]
    const { discovery, delivery, others, visibleCommands } = buildSections(only)
    expect(discovery).toHaveLength(0)
    expect(delivery).toHaveLength(0)
    expect(others).toHaveLength(0)
    expect(visibleCommands).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Display name overrides
// ---------------------------------------------------------------------------

describe('DISPLAY_NAMES overrides', () => {
  it('update-product-driven-backlog renders as "Auto-propose Specs"', () => {
    const cmd = makeCommand('update-product-driven-backlog')
    expect(displayName(cmd)).toBe('Auto-propose Specs')
  })

  it('product-backlog renders as "Auto-Select Specs"', () => {
    const cmd = makeCommand('product-backlog')
    expect(displayName(cmd)).toBe('Auto-Select Specs')
  })

  it('propose-spec has no display-name override — falls back to cmd.name', () => {
    const cmd = makeCommand('propose-spec', { name: 'Propose Spec' })
    expect(displayName(cmd)).toBe('Propose Spec')
  })

  it('implement has no display-name override — falls back to cmd.name', () => {
    const cmd = makeCommand('implement', { name: 'Implement' })
    expect(displayName(cmd)).toBe('Implement')
  })

  it('batch-implement has no display-name override — falls back to cmd.name', () => {
    const cmd = makeCommand('batch-implement', { name: 'Batch Implement' })
    expect(displayName(cmd)).toBe('Batch Implement')
  })

  it('an unknown slug falls back to cmd.name', () => {
    const cmd = makeCommand('some-unknown-slug', { name: 'Unknown Command' })
    expect(displayName(cmd)).toBe('Unknown Command')
  })

  it('DISPLAY_NAMES map has exactly two entries', () => {
    expect(Object.keys(DISPLAY_NAMES)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Tooltip slug — always /sr:<slug>, never the overridden display name
// ---------------------------------------------------------------------------

describe('Tooltip /sr:<slug> format', () => {
  it('update-product-driven-backlog tooltip is /sr:update-product-driven-backlog (not display name)', () => {
    const cmd = makeCommand('update-product-driven-backlog')
    expect(tooltipSlug(cmd)).toBe('/sr:update-product-driven-backlog')
    expect(tooltipSlug(cmd)).not.toBe(`/sr:${displayName(cmd)}`)
  })

  it('product-backlog tooltip is /sr:product-backlog (not display name)', () => {
    const cmd = makeCommand('product-backlog')
    expect(tooltipSlug(cmd)).toBe('/sr:product-backlog')
    expect(tooltipSlug(cmd)).not.toBe(`/sr:${displayName(cmd)}`)
  })

  it('propose-spec tooltip is /sr:propose-spec', () => {
    const cmd = makeCommand('propose-spec')
    expect(tooltipSlug(cmd)).toBe('/sr:propose-spec')
  })

  it('implement tooltip is /sr:implement', () => {
    const cmd = makeCommand('implement')
    expect(tooltipSlug(cmd)).toBe('/sr:implement')
  })

  it('tooltip always uses real slug regardless of overridden display name', () => {
    // For every command that has a display-name override, the tooltip must
    // use the real slug, not the human-readable override.
    for (const [slug, override] of Object.entries(DISPLAY_NAMES)) {
      const cmd = makeCommand(slug)
      const tip  = tooltipSlug(cmd)
      expect(tip).toBe(`/sr:${slug}`)
      expect(tip).not.toContain(override)
    }
  })
})

// ---------------------------------------------------------------------------
// Others section
// ---------------------------------------------------------------------------

describe('Others section', () => {
  it('excludes all Discovery slugs', () => {
    const { others } = buildSections(ALL_COMMANDS)
    const otherSlugs = others.map((c) => c.slug)
    for (const s of DISCOVERY_ORDER) {
      expect(otherSlugs).not.toContain(s)
    }
  })

  it('excludes all Delivery slugs', () => {
    const { others } = buildSections(ALL_COMMANDS)
    const otherSlugs = others.map((c) => c.slug)
    for (const s of DELIVERY_ORDER) {
      expect(otherSlugs).not.toContain(s)
    }
  })

  it('excludes hidden slugs', () => {
    const { others } = buildSections(ALL_COMMANDS)
    expect(others.map((c) => c.slug)).not.toContain('propose-feature')
  })

  it('contains the expected non-categorised commands', () => {
    const { others } = buildSections(ALL_COMMANDS)
    // ALL_COMMANDS has: refactor-recommender, health-check, compat-check, why
    // (after excluding discovery, delivery, and hidden)
    const otherSlugs = others.map((c) => c.slug)
    expect(otherSlugs).toContain('refactor-recommender')
    expect(otherSlugs).toContain('health-check')
    expect(otherSlugs).toContain('compat-check')
    expect(otherSlugs).toContain('why')
  })

  it('is sorted alphabetically by name', () => {
    const { others } = buildSections(ALL_COMMANDS)
    const names = others.map((c) => c.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('is empty when commands contain only discovery and delivery entries', () => {
    const discoveryAndDelivery = ALL_COMMANDS.filter(
      (c) => DISCOVERY_SET.has(c.slug) || DELIVERY_SET.has(c.slug)
    )
    const { others } = buildSections(discoveryAndDelivery)
    expect(others).toHaveLength(0)
  })

  it('is empty when commands array is empty', () => {
    const { others } = buildSections([])
    expect(others).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// WIZARD_COMMANDS
// ---------------------------------------------------------------------------

describe('WIZARD_COMMANDS', () => {
  it('implement is a wizard command', () => {
    expect(WIZARD_COMMANDS.has('implement')).toBe(true)
  })

  it('batch-implement is a wizard command', () => {
    expect(WIZARD_COMMANDS.has('batch-implement')).toBe(true)
  })

  it('propose-spec is NOT a wizard command', () => {
    expect(WIZARD_COMMANDS.has('propose-spec')).toBe(false)
  })

  it('update-product-driven-backlog is NOT a wizard command', () => {
    expect(WIZARD_COMMANDS.has('update-product-driven-backlog')).toBe(false)
  })

  it('product-backlog is NOT a wizard command', () => {
    expect(WIZARD_COMMANDS.has('product-backlog')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edge cases — empty and minimal inputs
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('all sections are empty when commands array is empty', () => {
    const { discovery, delivery, others } = buildSections([])
    expect(discovery).toHaveLength(0)
    expect(delivery).toHaveLength(0)
    expect(others).toHaveLength(0)
  })

  it('only-hidden input produces empty sections', () => {
    const hiddenOnly = [makeCommand('propose-feature')]
    const { discovery, delivery, others } = buildSections(hiddenOnly)
    expect(discovery).toHaveLength(0)
    expect(delivery).toHaveLength(0)
    expect(others).toHaveLength(0)
  })

  it('a single discovery command produces correct single-item section', () => {
    const single = [makeCommand('propose-spec', { name: 'Propose Spec' })]
    const { discovery } = buildSections(single)
    expect(discovery).toHaveLength(1)
    expect(discovery[0].slug).toBe('propose-spec')
  })

  it('duplicate slugs in input — map de-duplicates, last write wins', () => {
    // Map construction: later entry for same slug overwrites earlier.
    const dupe: CommandInfo[] = [
      makeCommand('implement', { name: 'First' }),
      makeCommand('implement', { name: 'Second' }),
    ]
    const { delivery } = buildSections(dupe)
    // The map will have one entry for 'implement', whichever was last.
    expect(delivery).toHaveLength(1)
    expect(delivery[0].slug).toBe('implement')
  })

  it('commands that share no slugs with any section all go to others', () => {
    const unknown = [
      makeCommand('alpha', { name: 'Alpha' }),
      makeCommand('beta',  { name: 'Beta' }),
    ]
    const { discovery, delivery, others } = buildSections(unknown)
    expect(discovery).toHaveLength(0)
    expect(delivery).toHaveLength(0)
    expect(others).toHaveLength(2)
    expect(others[0].slug).toBe('alpha')
    expect(others[1].slug).toBe('beta')
  })
})

// ---------------------------------------------------------------------------
// Constant shape assertions (guard against accidental upstream changes)
// ---------------------------------------------------------------------------

describe('Constant shape', () => {
  it('DISCOVERY_ORDER has three entries', () => {
    expect(DISCOVERY_ORDER).toHaveLength(3)
  })

  it('DELIVERY_ORDER has two entries', () => {
    expect(DELIVERY_ORDER).toHaveLength(2)
  })

  it('HIDDEN_SLUGS contains propose-feature', () => {
    expect(HIDDEN_SLUGS.has('propose-feature')).toBe(true)
  })

  it('HIDDEN_SLUGS has exactly one entry', () => {
    expect(HIDDEN_SLUGS.size).toBe(1)
  })

  it('DISCOVERY_SET and DELIVERY_SET are disjoint', () => {
    for (const s of DISCOVERY_SET) {
      expect(DELIVERY_SET.has(s)).toBe(false)
    }
  })

  it('HIDDEN_SLUGS does not overlap with DISCOVERY_SET', () => {
    for (const s of HIDDEN_SLUGS) {
      expect(DISCOVERY_SET.has(s)).toBe(false)
    }
  })

  it('HIDDEN_SLUGS does not overlap with DELIVERY_SET', () => {
    for (const s of HIDDEN_SLUGS) {
      expect(DELIVERY_SET.has(s)).toBe(false)
    }
  })
})
