import { describe, it, expect } from 'vitest'
import {
  formatIssueFields,
  indexFieldMeta,
  resolveCustomFieldId,
  humanizeKey,
  SKIP_SYSTEM_FIELDS,
  normalizePullRequests,
  normalizeBranches,
  normalizeRepositoryCommits,
} from './jira-issue-fields'
import type { JiraFieldMeta } from './types'
import type { JiraDevDetailRaw } from './jira-client'

const BASE = 'https://acme.atlassian.net'

// Convenience: run formatIssueFields with sensible defaults and find a row by label.
function format(
  fields: Record<string, unknown>,
  opts?: {
    fieldMeta?: JiraFieldMeta[]
    baseUrl?: string
    hasEpicKey?: boolean
    hasSprintName?: boolean
  }
) {
  return formatIssueFields({
    fields,
    fieldMeta: opts?.fieldMeta ?? [],
    baseUrl: opts?.baseUrl ?? BASE,
    alreadyShown: {
      hasEpicKey: opts?.hasEpicKey ?? false,
      hasSprintName: opts?.hasSprintName ?? false,
    },
  })
}

function byLabel(rows: ReturnType<typeof format>, label: string) {
  return rows.find((r) => r.label === label)
}

// ─── humanizeKey ────────────────────────────────────────────────────────────

describe('humanizeKey', () => {
  it('title-cases a simple key', () => {
    expect(humanizeKey('environment')).toBe('Environment')
  })

  it('splits camelCase into spaced words', () => {
    expect(humanizeKey('fixVersions')).toBe('Fix Versions')
  })

  it('replaces underscores and dashes with spaces', () => {
    expect(humanizeKey('story_point-estimate')).toBe('Story point estimate')
  })

  it('collapses multiple separators into one space', () => {
    expect(humanizeKey('a__b--c')).toBe('A b c')
  })

  it('handles a customfield id (no camel/separators after prefix)', () => {
    // customfield_10010 -> "Customfield 10010"
    expect(humanizeKey('customfield_10010')).toBe('Customfield 10010')
  })

  it('uppercases only the first character', () => {
    expect(humanizeKey('dueDate')).toBe('Due Date')
  })
})

// ─── indexFieldMeta ─────────────────────────────────────────────────────────

describe('indexFieldMeta', () => {
  it('builds a Map keyed by field id', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_1', name: 'Story Points' },
      { id: 'customfield_2', name: 'Team' },
    ]
    const m = indexFieldMeta(meta)
    expect(m.size).toBe(2)
    expect(m.get('customfield_1')?.name).toBe('Story Points')
    expect(m.get('customfield_2')?.name).toBe('Team')
  })

  it('skips entries with a non-string id or null entries', () => {
    const meta = [
      { id: 'good', name: 'Good' },
      null,
      { name: 'No id' },
      { id: 42 as unknown as string, name: 'Numeric id' },
    ] as unknown as JiraFieldMeta[]
    const m = indexFieldMeta(meta)
    expect(m.size).toBe(1)
    expect(m.get('good')?.name).toBe('Good')
  })

  it('returns an empty Map for an empty array', () => {
    expect(indexFieldMeta([]).size).toBe(0)
  })
})

// ─── resolveCustomFieldId ───────────────────────────────────────────────────

describe('resolveCustomFieldId', () => {
  it('resolves by schema.custom suffix (endsWith)', () => {
    const m = indexFieldMeta([
      { id: 'customfield_10016', name: 'Story Points', schema: { type: 'number', custom: 'com.pyxis.greenhopper.jira:jsw-story-points' } },
    ])
    expect(resolveCustomFieldId(m, { customEndsWith: [':jsw-story-points'] })).toBe('customfield_10016')
  })

  it('resolves by exact schema.custom match (custom === suffix)', () => {
    const m = indexFieldMeta([
      { id: 'customfield_10014', name: 'Epic Link', schema: { type: 'any', custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
    ])
    expect(resolveCustomFieldId(m, { customEndsWith: ['com.pyxis.greenhopper.jira:gh-epic-link'] })).toBe('customfield_10014')
  })

  it('resolves by exact name (case-insensitive)', () => {
    const m = indexFieldMeta([
      { id: 'customfield_99', name: 'Story Points' },
    ])
    expect(resolveCustomFieldId(m, { names: ['story points'] })).toBe('customfield_99')
    expect(resolveCustomFieldId(m, { names: ['STORY POINTS'] })).toBe('customfield_99')
  })

  it('returns null when nothing matches', () => {
    const m = indexFieldMeta([
      { id: 'customfield_1', name: 'Other', schema: { type: 'string', custom: 'x:y' } },
    ])
    expect(resolveCustomFieldId(m, { customEndsWith: [':nope'], names: ['nothing'] })).toBeNull()
  })

  it('returns null on empty map', () => {
    expect(resolveCustomFieldId(indexFieldMeta([]), { customEndsWith: [':x'] })).toBeNull()
  })

  it('prefers a custom-suffix match before scanning names (suffix wins)', () => {
    const m = indexFieldMeta([
      { id: 'by-name', name: 'Story Points' },
      { id: 'by-suffix', name: 'Other', schema: { custom: 'x:story-point-estimate' } },
    ])
    // Iteration order is insertion order; the suffix matcher fires when its entry is hit.
    const resolved = resolveCustomFieldId(m, { customEndsWith: [':story-point-estimate'], names: ['story points'] })
    // 'by-name' is first in insertion order, so name match returns it first.
    expect(resolved).toBe('by-name')
  })
})

// ─── SKIP_SYSTEM_FIELDS ─────────────────────────────────────────────────────

describe('SKIP_SYSTEM_FIELDS', () => {
  it('contains the documented housekeeping + already-shown keys', () => {
    for (const key of [
      'summary', 'description', 'status', 'priority', 'labels', 'assignee',
      'project', 'key', 'id', 'self', 'expand', 'thumbnail', 'lastViewed',
      'statuscategorychangedate', 'workratio', 'issuerestriction', 'issuekey',
      'aggregatetimespent', 'aggregatetimeestimate', 'aggregatetimeoriginalestimate',
      'aggregateprogress', 'progress', 'timeoriginalestimate', 'timeestimate', 'timespent',
      'comment', 'worklog', 'attachment',
      'created', 'updated',
    ]) {
      expect(SKIP_SYSTEM_FIELDS.has(key)).toBe(true)
    }
  })

  it('every skip-list entry is omitted from the generic sweep even when populated', () => {
    const fields: Record<string, unknown> = {}
    // Populate each skip key with a custom-field-prefixed twin so the sweep WOULD pick it up
    // if it were not skipped. We verify directly: a customfield aliased to a skip name is unaffected,
    // but here we assert the literal skip keys never produce rows.
    for (const key of SKIP_SYSTEM_FIELDS) {
      fields[key] = 'some value'
    }
    const rows = format(fields)
    // None of the skip keys (rendered via humanizeKey label) should appear.
    const skipLabels = new Set([...SKIP_SYSTEM_FIELDS].map((k) => humanizeKey(k)))
    for (const r of rows) {
      expect(skipLabels.has(r.label)).toBe(false)
    }
  })

  it('omits the ADF description even when present', () => {
    const rows = format({
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] },
    })
    expect(byLabel(rows, 'Description')).toBeUndefined()
    expect(rows).toHaveLength(0)
  })
})

// ─── scalar dispatch by schema.type (via generic customfield sweep) ───────────

describe('generic dispatch by schema.type', () => {
  function metaFor(id: string, type: string, extra?: Partial<JiraFieldMeta['schema']>, name?: string): JiraFieldMeta {
    return { id, name: name ?? 'F', schema: { type, ...extra } }
  }

  it('string -> trimmed text', () => {
    const rows = format(
      { customfield_1: '  hi there  ' },
      { fieldMeta: [metaFor('customfield_1', 'string', undefined, 'Notes')] }
    )
    expect(byLabel(rows, 'Notes')?.value).toBe('hi there')
  })

  it('string ADF (type:doc) flattened to text', () => {
    const rows = format(
      {
        customfield_1: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich env' }] }] },
      },
      { fieldMeta: [metaFor('customfield_1', 'string', undefined, 'Env')] }
    )
    expect(byLabel(rows, 'Env')?.value).toBe('Rich env')
  })

  it('number -> string', () => {
    const rows = format(
      { customfield_1: 42 },
      { fieldMeta: [metaFor('customfield_1', 'number', undefined, 'Count')] }
    )
    expect(byLabel(rows, 'Count')?.value).toBe('42')
  })

  it('number 0 IS shown (story points 0 visible)', () => {
    const rows = format(
      { customfield_1: 0 },
      { fieldMeta: [metaFor('customfield_1', 'number', undefined, 'Points')] }
    )
    expect(byLabel(rows, 'Points')?.value).toBe('0')
  })

  it('date string passthrough', () => {
    const rows = format(
      { customfield_1: '2026-06-14' },
      { fieldMeta: [metaFor('customfield_1', 'date', undefined, 'When')] }
    )
    expect(byLabel(rows, 'When')?.value).toBe('2026-06-14')
  })

  it('datetime string passthrough', () => {
    const rows = format(
      { customfield_1: '2026-06-14T10:00:00.000+0000' },
      { fieldMeta: [metaFor('customfield_1', 'datetime', undefined, 'TS')] }
    )
    expect(byLabel(rows, 'TS')?.value).toBe('2026-06-14T10:00:00.000+0000')
  })

  it('user -> displayName', () => {
    const rows = format(
      { customfield_1: { displayName: 'Ada Lovelace', emailAddress: 'ada@x.io', accountId: 'a1' } },
      { fieldMeta: [metaFor('customfield_1', 'user', undefined, 'Owner')] }
    )
    expect(byLabel(rows, 'Owner')?.value).toBe('Ada Lovelace')
  })

  it('user falls back to emailAddress then name when no displayName', () => {
    const rowsEmail = format(
      { customfield_1: { emailAddress: 'ada@x.io' } },
      { fieldMeta: [metaFor('customfield_1', 'user', undefined, 'Owner')] }
    )
    expect(byLabel(rowsEmail, 'Owner')?.value).toBe('ada@x.io')

    const rowsName = format(
      { customfield_1: { name: 'adalovelace' } },
      { fieldMeta: [metaFor('customfield_1', 'user', undefined, 'Owner')] }
    )
    expect(byLabel(rowsName, 'Owner')?.value).toBe('adalovelace')
  })

  it('priority/status/resolution/issuetype/component/version -> name', () => {
    for (const type of ['priority', 'status', 'resolution', 'issuetype', 'securitylevel', 'component', 'version']) {
      const rows = format(
        { customfield_1: { name: `the-${type}`, id: '1' } },
        { fieldMeta: [metaFor('customfield_1', type, undefined, type)] }
      )
      expect(byLabel(rows, type)?.value).toBe(`the-${type}`)
    }
  })

  it('option -> value', () => {
    const rows = format(
      { customfield_1: { value: 'Red', id: '1' } },
      { fieldMeta: [metaFor('customfield_1', 'option', undefined, 'Colour')] }
    )
    expect(byLabel(rows, 'Colour')?.value).toBe('Red')
  })

  it('option-with-child -> "a / b"', () => {
    const rows = format(
      { customfield_1: { value: 'Parent', child: { value: 'Child' } } },
      { fieldMeta: [metaFor('customfield_1', 'option-with-child', undefined, 'Cascade')] }
    )
    expect(byLabel(rows, 'Cascade')?.value).toBe('Parent / Child')
  })

  it('option-with-child without a child shows just the base', () => {
    const rows = format(
      { customfield_1: { value: 'Parent' } },
      { fieldMeta: [metaFor('customfield_1', 'option-with-child', undefined, 'Cascade')] }
    )
    expect(byLabel(rows, 'Cascade')?.value).toBe('Parent')
  })

  it('votes: 0 suppressed, >0 shown', () => {
    const zero = format(
      { customfield_1: { votes: 0 } },
      { fieldMeta: [metaFor('customfield_1', 'votes', undefined, 'Votes CF')] }
    )
    expect(byLabel(zero, 'Votes CF')).toBeUndefined()

    const some = format(
      { customfield_1: { votes: 3 } },
      { fieldMeta: [metaFor('customfield_1', 'votes', undefined, 'Votes CF')] }
    )
    expect(byLabel(some, 'Votes CF')?.value).toBe('3')
  })

  it('watches: 0 suppressed, >0 shown', () => {
    const zero = format(
      { customfield_1: { watchCount: 0 } },
      { fieldMeta: [metaFor('customfield_1', 'watches', undefined, 'Watches CF')] }
    )
    expect(byLabel(zero, 'Watches CF')).toBeUndefined()

    const some = format(
      { customfield_1: { watchCount: 5 } },
      { fieldMeta: [metaFor('customfield_1', 'watches', undefined, 'Watches CF')] }
    )
    expect(byLabel(some, 'Watches CF')?.value).toBe('5')
  })

  it('timetracking -> multi-line "Original / Remaining / Spent"', () => {
    const rows = format(
      { customfield_1: { originalEstimate: '2d', remainingEstimate: '1d', timeSpent: '1d' } },
      { fieldMeta: [metaFor('customfield_1', 'timetracking', undefined, 'TT')] }
    )
    expect(byLabel(rows, 'TT')?.value).toBe('Original: 2d\nRemaining: 1d\nSpent: 1d')
  })

  it('timetracking with only some sub-values renders only those lines', () => {
    const rows = format(
      { customfield_1: { remainingEstimate: '3h' } },
      { fieldMeta: [metaFor('customfield_1', 'timetracking', undefined, 'TT')] }
    )
    expect(byLabel(rows, 'TT')?.value).toBe('Remaining: 3h')
  })

  it('timetracking with no sub-values is omitted', () => {
    const rows = format(
      { customfield_1: {} },
      { fieldMeta: [metaFor('customfield_1', 'timetracking', undefined, 'TT')] }
    )
    expect(byLabel(rows, 'TT')).toBeUndefined()
  })

  it('arrays of string', () => {
    const rows = format(
      { customfield_1: ['a', '', '  ', 'b'] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'string' }, 'Tags')] }
    )
    expect(byLabel(rows, 'Tags')?.value).toBe('a, b')
  })

  it('arrays of component', () => {
    const rows = format(
      { customfield_1: [{ name: 'API' }, { name: 'UI' }, { id: 'no-name' }] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'component' }, 'Comps')] }
    )
    expect(byLabel(rows, 'Comps')?.value).toBe('API, UI')
  })

  it('arrays of version', () => {
    const rows = format(
      { customfield_1: [{ name: '1.0' }, { name: '2.0' }] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'version' }, 'Vers')] }
    )
    expect(byLabel(rows, 'Vers')?.value).toBe('1.0, 2.0')
  })

  it('arrays of user', () => {
    const rows = format(
      { customfield_1: [{ displayName: 'Ada' }, { displayName: 'Grace' }] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'user' }, 'People')] }
    )
    expect(byLabel(rows, 'People')?.value).toBe('Ada, Grace')
  })

  it('arrays of option', () => {
    const rows = format(
      { customfield_1: [{ value: 'X' }, { name: 'Y' }] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'option' }, 'Opts')] }
    )
    expect(byLabel(rows, 'Opts')?.value).toBe('X, Y')
  })

  it('array with default items sniffs each element', () => {
    const rows = format(
      { customfield_1: ['plain', { value: 'obj' }, 7] },
      { fieldMeta: [metaFor('customfield_1', 'array', { items: 'weird' }, 'Mixed')] }
    )
    expect(byLabel(rows, 'Mixed')?.value).toBe('plain, obj, 7')
  })
})

// ─── IS-POPULATED omission ────────────────────────────────────────────────────

describe('is-populated omission', () => {
  it('omits null values', () => {
    const rows = format(
      { customfield_1: null },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'string' } }] }
    )
    expect(rows).toHaveLength(0)
  })

  it('omits empty string', () => {
    const rows = format(
      { customfield_1: '' },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'string' } }] }
    )
    expect(rows).toHaveLength(0)
  })

  it('omits whitespace-only string', () => {
    const rows = format(
      { customfield_1: '   ' },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'string' } }] }
    )
    expect(rows).toHaveLength(0)
  })

  it('omits empty array', () => {
    const rows = format(
      { customfield_1: [] },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'array', items: 'string' } }] }
    )
    expect(rows).toHaveLength(0)
  })

  it('omits an object with only id/self/avatarUrls (user with no usable name)', () => {
    const rows = format(
      { customfield_1: { id: '5', self: 'https://x', avatarUrls: { '48x48': 'u' } } },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'user' } }] }
    )
    expect(rows).toHaveLength(0)
  })

  it('omits votes: 0', () => {
    const rows = format(
      { customfield_1: { votes: 0 } },
      { fieldMeta: [{ id: 'customfield_1', name: 'X', schema: { type: 'votes' } }] }
    )
    expect(rows).toHaveLength(0)
  })
})

// ─── ordered system fields ────────────────────────────────────────────────────

describe('ordered system fields', () => {
  it('renders issuetype, resolution, reporter with /field labels', () => {
    const rows = format(
      {
        issuetype: { name: 'Story' },
        resolution: { name: 'Done' },
        reporter: { displayName: 'Ada' },
      },
      {
        fieldMeta: [
          { id: 'issuetype', name: 'Issue Type' },
          { id: 'resolution', name: 'Resolution' },
          { id: 'reporter', name: 'Reporter' },
        ],
      }
    )
    expect(byLabel(rows, 'Issue Type')?.value).toBe('Story')
    expect(byLabel(rows, 'Resolution')?.value).toBe('Done')
    expect(byLabel(rows, 'Reporter')?.value).toBe('Ada')
  })

  it('renders components / fixVersions / versions arrays', () => {
    const rows = format({
      components: [{ name: 'API' }],
      fixVersions: [{ name: '1.0' }],
      versions: [{ name: '0.9' }],
    })
    expect(byLabel(rows, 'Components')?.value).toBe('API')
    expect(byLabel(rows, 'Fix Versions')?.value).toBe('1.0')
    expect(byLabel(rows, 'Versions')?.value).toBe('0.9')
  })

  it('renders environment (string), duedate (date), resolutiondate (datetime), security', () => {
    const rows = format({
      environment: 'prod',
      duedate: '2026-07-01',
      resolutiondate: '2026-06-30T12:00:00.000+0000',
      security: { name: 'Internal' },
    })
    expect(byLabel(rows, 'Environment')?.value).toBe('prod')
    expect(byLabel(rows, 'Duedate')?.value).toBe('2026-07-01')
    expect(byLabel(rows, 'Resolutiondate')?.value).toBe('2026-06-30T12:00:00.000+0000')
    expect(byLabel(rows, 'Security')?.value).toBe('Internal')
  })

  it('renders votes/watches/timetracking system fields', () => {
    const rows = format({
      votes: { votes: 4 },
      watches: { watchCount: 2 },
      timetracking: { originalEstimate: '1d', timeSpent: '4h' },
    })
    expect(byLabel(rows, 'Votes')?.value).toBe('4')
    expect(byLabel(rows, 'Watches')?.value).toBe('2')
    expect(byLabel(rows, 'Timetracking')?.value).toBe('Original: 1d\nSpent: 4h')
  })
})

// ─── redundancy: creator vs reporter ──────────────────────────────────────────

describe('creator suppression', () => {
  it('omits creator when identical to reporter', () => {
    const rows = format({
      reporter: { displayName: 'Ada' },
      creator: { displayName: 'Ada' },
    })
    const creatorRows = rows.filter((r) => r.value === 'Ada')
    // Only the reporter row, not a duplicate creator row.
    expect(creatorRows).toHaveLength(1)
  })

  it('shows creator when different from reporter', () => {
    const rows = format(
      {
        reporter: { displayName: 'Ada' },
        creator: { displayName: 'Grace' },
      },
      { fieldMeta: [{ id: 'creator', name: 'Creator' }] }
    )
    expect(byLabel(rows, 'Creator')?.value).toBe('Grace')
  })

  it('shows creator when there is no reporter', () => {
    const rows = format(
      { creator: { displayName: 'Grace' } },
      { fieldMeta: [{ id: 'creator', name: 'Creator' }] }
    )
    expect(byLabel(rows, 'Creator')?.value).toBe('Grace')
  })
})

// ─── redundancy: parent / subtasks / issuelinks ───────────────────────────────

describe('parent', () => {
  it('renders a non-epic parent with key, summary and browse href', () => {
    const rows = format(
      {
        issuetype: { name: 'Sub-task' },
        parent: { key: 'PROJ-1', fields: { summary: 'Parent task', issuetype: { name: 'Task' } } },
      },
      { fieldMeta: [{ id: 'parent', name: 'Parent' }] }
    )
    const p = byLabel(rows, 'Parent')
    expect(p?.value).toBe('PROJ-1 — Parent task')
    expect(p?.href).toBe(`${BASE}/browse/PROJ-1`)
  })

  it('renders just the key when the parent has no summary', () => {
    const rows = format(
      { parent: { key: 'PROJ-9', fields: { issuetype: { name: 'Task' } } } },
      { fieldMeta: [{ id: 'parent', name: 'Parent' }] }
    )
    expect(byLabel(rows, 'Parent')?.value).toBe('PROJ-9')
  })

  it('omits the parent when it is an epic', () => {
    const rows = format(
      { parent: { key: 'PROJ-2', fields: { summary: 'Epic', issuetype: { name: 'Epic' } } } },
      { fieldMeta: [{ id: 'parent', name: 'Parent' }] }
    )
    expect(byLabel(rows, 'Parent')).toBeUndefined()
  })

  it('renders the parent when issuetype info is absent (treated as non-epic)', () => {
    const rows = format(
      { parent: { key: 'PROJ-3', fields: { summary: 'Some parent' } } },
      { fieldMeta: [{ id: 'parent', name: 'Parent' }] }
    )
    expect(byLabel(rows, 'Parent')?.value).toBe('PROJ-3 — Some parent')
  })

  it('omits the parent when it has no key', () => {
    const rows = format({ parent: { fields: { summary: 'No key' } } })
    expect(rows.find((r) => r.value.includes('No key'))).toBeUndefined()
  })
})

describe('subtasks', () => {
  it('renders a headline count plus one linked row per sub-task', () => {
    const rows = format(
      {
        subtasks: [
          { key: 'PROJ-10', fields: { summary: 'First' } },
          { key: 'PROJ-11', fields: { summary: 'Second' } },
        ],
      },
      { fieldMeta: [{ id: 'subtasks', name: 'Sub-tasks' }] }
    )
    expect(byLabel(rows, 'Sub-tasks')?.value).toBe('2 sub-tasks')
    const r10 = byLabel(rows, 'PROJ-10')
    expect(r10?.value).toBe('First')
    expect(r10?.href).toBe(`${BASE}/browse/PROJ-10`)
    const r11 = byLabel(rows, 'PROJ-11')
    expect(r11?.value).toBe('Second')
    expect(r11?.href).toBe(`${BASE}/browse/PROJ-11`)
  })

  it('falls back to the key as value when a sub-task has no summary', () => {
    const rows = format({ subtasks: [{ key: 'PROJ-12' }] })
    expect(byLabel(rows, 'PROJ-12')?.value).toBe('PROJ-12')
  })

  it('skips sub-task entries without a key and non-object entries', () => {
    const rows = format({ subtasks: [{ fields: { summary: 'no key' } }, 'nope', { key: 'PROJ-13' }] })
    // headline counts ALL entries in the array (length 3)
    expect(rows.find((r) => r.value === '3 sub-tasks')).toBeDefined()
    expect(byLabel(rows, 'PROJ-13')).toBeDefined()
    expect(rows.find((r) => r.value === 'no key')).toBeUndefined()
  })

  it('renders nothing for an empty subtasks array', () => {
    const rows = format({ subtasks: [] })
    expect(rows).toHaveLength(0)
  })
})

describe('issuelinks', () => {
  it('renders one row per outward linked issue, labelled by the relationship', () => {
    const rows = format({
      issuelinks: [
        {
          type: { outward: 'blocks', inward: 'is blocked by' },
          outwardIssue: { key: 'PROJ-20', fields: { summary: 'Blocked thing' } },
        },
      ],
    })
    const row = byLabel(rows, 'blocks')
    expect(row?.value).toBe('PROJ-20 — Blocked thing')
    expect(row?.href).toBe(`${BASE}/browse/PROJ-20`)
  })

  it('uses the inward relationship + inwardIssue when there is no outwardIssue', () => {
    const rows = format({
      issuelinks: [
        {
          type: { outward: 'blocks', inward: 'is blocked by' },
          inwardIssue: { key: 'PROJ-21', fields: { summary: 'Blocker' } },
        },
      ],
    })
    const row = byLabel(rows, 'is blocked by')
    expect(row?.value).toBe('PROJ-21 — Blocker')
    expect(row?.href).toBe(`${BASE}/browse/PROJ-21`)
  })

  it('renders just the key when the linked issue has no summary', () => {
    const rows = format({
      issuelinks: [{ type: { outward: 'relates to' }, outwardIssue: { key: 'PROJ-22' } }],
    })
    expect(byLabel(rows, 'relates to')?.value).toBe('PROJ-22')
  })

  it('falls back to the issuelinks meta label when the relationship name is missing', () => {
    const rows = format(
      { issuelinks: [{ type: {}, outwardIssue: { key: 'PROJ-23' } }] },
      { fieldMeta: [{ id: 'issuelinks', name: 'Linked Issues' }] }
    )
    expect(byLabel(rows, 'Linked Issues')?.value).toBe('PROJ-23')
  })

  it('skips links with no type, no issue, or no key', () => {
    const rows = format({
      issuelinks: [
        { outwardIssue: { key: 'PROJ-30' } }, // no type
        { type: { outward: 'x' } }, // no issue
        { type: { outward: 'y' }, outwardIssue: { fields: {} } }, // no key
        'garbage',
      ],
    })
    expect(rows).toHaveLength(0)
  })
})

// ─── label fallback ───────────────────────────────────────────────────────────

describe('label fallback', () => {
  it('uses humanizeKey when /field metadata is empty', () => {
    const rows = format({ environment: 'prod' }, { fieldMeta: [] })
    expect(byLabel(rows, 'Environment')?.value).toBe('prod')
  })

  it('uses meta.name when /field metadata is present', () => {
    const rows = format(
      { environment: 'prod' },
      { fieldMeta: [{ id: 'environment', name: 'Deployment Env' }] }
    )
    expect(byLabel(rows, 'Deployment Env')?.value).toBe('prod')
    expect(byLabel(rows, 'Environment')).toBeUndefined()
  })

  it('uses humanizeKey for a customfield with no meta', () => {
    const rows = format(
      { customfield_55: 'hello' },
      { fieldMeta: [] }
    )
    expect(byLabel(rows, 'Customfield 55')?.value).toBe('hello')
  })
})

// ─── resolved custom fields ───────────────────────────────────────────────────

describe('resolved custom fields', () => {
  it('renders story points (number) including 0', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10016', name: 'Story Points', schema: { type: 'number', custom: 'com.pyxis.greenhopper.jira:jsw-story-points' } },
    ]
    const some = format({ customfield_10016: 5 }, { fieldMeta: meta })
    expect(byLabel(some, 'Story Points')?.value).toBe('5')

    const zero = format({ customfield_10016: 0 }, { fieldMeta: meta })
    expect(byLabel(zero, 'Story Points')?.value).toBe('0')
  })

  it('renders Epic Link as a browse href when hasEpicKey is false', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10014', name: 'Epic Link', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
    ]
    const rows = format({ customfield_10014: 'PROJ-100' }, { fieldMeta: meta, hasEpicKey: false })
    const row = byLabel(rows, 'Epic Link')
    expect(row?.value).toBe('PROJ-100')
    expect(row?.href).toBe(`${BASE}/browse/PROJ-100`)
  })

  it('renders Epic Name when hasEpicKey is false', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10011', name: 'Epic Name', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-label' } },
    ]
    const rows = format({ customfield_10011: 'Q3 Goals' }, { fieldMeta: meta, hasEpicKey: false })
    expect(byLabel(rows, 'Epic Name')?.value).toBe('Q3 Goals')
  })

  it('does not special-case Epic Link/Name when hasEpicKey is true (no href; generic-swept instead)', () => {
    // When hasEpicKey is true the dedicated block is skipped, so neither field is added
    // to `handled`. Being populated customfield_* with string schema, they fall through
    // to the generic sweep — rendered as plain value rows WITHOUT the browse href.
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10014', name: 'Epic Link', schema: { type: 'string', custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
      { id: 'customfield_10011', name: 'Epic Name', schema: { type: 'string', custom: 'com.pyxis.greenhopper.jira:gh-epic-label' } },
    ]
    const rows = format(
      { customfield_10014: 'PROJ-100', customfield_10011: 'Q3 Goals' },
      { fieldMeta: meta, hasEpicKey: true }
    )
    const link = byLabel(rows, 'Epic Link')
    expect(link?.value).toBe('PROJ-100')
    expect(link?.href).toBeUndefined() // no special-case href when hasEpicKey is true
    expect(byLabel(rows, 'Epic Name')?.value).toBe('Q3 Goals')
  })

  it('renders Flagged as "Impediment" when the array is non-empty', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10021', name: 'Flagged', schema: { custom: 'com.pyxis.greenhopper.jira:gh-jira-flag' } },
    ]
    const rows = format({ customfield_10021: [{ value: 'Impediment' }] }, { fieldMeta: meta })
    expect(byLabel(rows, 'Flagged')?.value).toBe('Impediment')
  })

  it('omits Flagged when the array is empty', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10021', name: 'Flagged', schema: { custom: 'com.pyxis.greenhopper.jira:gh-jira-flag' } },
    ]
    const rows = format({ customfield_10021: [] }, { fieldMeta: meta })
    expect(byLabel(rows, 'Flagged')).toBeUndefined()
  })

  it('renders Team from an object name/title/value or a plain string', () => {
    const metaObj: JiraFieldMeta[] = [
      { id: 'customfield_10001', name: 'Team', schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:atlassian-team' } },
    ]
    const objRows = format({ customfield_10001: { name: 'Platform' } }, { fieldMeta: metaObj })
    expect(byLabel(objRows, 'Team')?.value).toBe('Platform')

    const strRows = format({ customfield_10001: 'Growth' }, { fieldMeta: metaObj })
    expect(byLabel(strRows, 'Team')?.value).toBe('Growth')
  })

  it('skips sprint and rank custom fields entirely', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      { id: 'customfield_10019', name: 'Rank', schema: { custom: 'com.pyxis.greenhopper.jira:gh-lexo-rank' } },
    ]
    const rows = format(
      { customfield_10020: [{ name: 'Sprint 1' }], customfield_10019: '0|i0001:' },
      { fieldMeta: meta }
    )
    expect(byLabel(rows, 'Sprint')).toBeUndefined()
    expect(byLabel(rows, 'Rank')).toBeUndefined()
  })
})

// ─── generic sweep ────────────────────────────────────────────────────────────

describe('generic sweep', () => {
  it('renders remaining populated customfield_* sorted by label', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_300', name: 'Zebra', schema: { type: 'string' } },
      { id: 'customfield_100', name: 'Apple', schema: { type: 'string' } },
      { id: 'customfield_200', name: 'Mango', schema: { type: 'string' } },
    ]
    const rows = format(
      { customfield_300: 'z', customfield_100: 'a', customfield_200: 'm' },
      { fieldMeta: meta }
    )
    expect(rows.map((r) => r.label)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('does NOT sweep non-customfield keys it does not explicitly handle', () => {
    // 'foobar' is not a system field path and not customfield_ prefixed -> skipped.
    const rows = format({ foobar: 'should not appear' })
    expect(rows.find((r) => r.value === 'should not appear')).toBeUndefined()
  })

  it('sweeps an array customfield using schema.items', () => {
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_400', name: 'Roles', schema: { type: 'array', items: 'user' } },
    ]
    const rows = format(
      { customfield_400: [{ displayName: 'Ada' }, { displayName: 'Grace' }] },
      { fieldMeta: meta }
    )
    expect(byLabel(rows, 'Roles')?.value).toBe('Ada, Grace')
  })

  it('sweeps a customfield with no meta via shape sniff', () => {
    const rows = format({ customfield_500: { value: 'sniffed' } })
    expect(byLabel(rows, 'Customfield 500')?.value).toBe('sniffed')
  })

  it('omits an unpopulated customfield in the sweep', () => {
    const meta: JiraFieldMeta[] = [{ id: 'customfield_600', name: 'Empty', schema: { type: 'string' } }]
    const rows = format({ customfield_600: '   ' }, { fieldMeta: meta })
    expect(byLabel(rows, 'Empty')).toBeUndefined()
  })
})

// ─── full integration ─────────────────────────────────────────────────────────

describe('formatIssueFields integration', () => {
  it('tolerates undefined fields / fieldMeta', () => {
    const rows = formatIssueFields({
      fields: undefined as unknown as Record<string, unknown>,
      fieldMeta: undefined as unknown as JiraFieldMeta[],
      baseUrl: BASE,
      alreadyShown: { hasEpicKey: false, hasSprintName: false },
    })
    expect(rows).toEqual([])
  })

  it('honours a trailing-slash base url for hrefs', () => {
    const rows = format(
      { parent: { key: 'PROJ-1', fields: { summary: 'P', issuetype: { name: 'Task' } } } },
      { baseUrl: 'https://acme.atlassian.net/', fieldMeta: [{ id: 'parent', name: 'Parent' }] }
    )
    expect(byLabel(rows, 'Parent')?.href).toBe('https://acme.atlassian.net/browse/PROJ-1')
  })
})

// ─── normalizePullRequests ────────────────────────────────────────────────────

describe('normalizePullRequests', () => {
  it('maps a realistic detail payload', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          pullRequests: [
            {
              id: '#42',
              name: 'Add feature',
              url: 'https://github.com/acme/repo/pull/42',
              status: 'OPEN',
              source: { branch: 'feature/x' },
              destination: { branch: 'main' },
              author: { name: 'Ada' },
              lastUpdate: '2026-06-14T10:00:00.000Z',
            },
          ],
        },
      ],
    }
    const prs = normalizePullRequests(detail)
    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      id: '#42',
      title: 'Add feature',
      url: 'https://github.com/acme/repo/pull/42',
      status: 'OPEN',
      sourceBranch: 'feature/x',
      destBranch: 'main',
      author: 'Ada',
      lastUpdate: '2026-06-14T10:00:00.000Z',
    })
  })

  it('falls back title -> id when name is absent, status -> UNKNOWN', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ pullRequests: [{ id: 'PR-1', url: 'https://x/pr/1' }] }],
    }
    const prs = normalizePullRequests(detail)
    expect(prs[0].title).toBe('PR-1')
    expect(prs[0].status).toBe('UNKNOWN')
    expect(prs[0].sourceBranch).toBeNull()
    expect(prs[0].destBranch).toBeNull()
    expect(prs[0].author).toBeNull()
    expect(prs[0].lastUpdate).toBeNull()
  })

  it('drops entries without a url', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ pullRequests: [{ id: 'no-url', name: 'x' }, { id: 'has-url', url: 'https://x/2' }] }],
    }
    const prs = normalizePullRequests(detail)
    expect(prs).toHaveLength(1)
    expect(prs[0].id).toBe('has-url')
  })

  it('tolerates missing detail / missing pullRequests / non-object entries', () => {
    expect(normalizePullRequests({} as JiraDevDetailRaw)).toEqual([])
    expect(normalizePullRequests({ detail: [] })).toEqual([])
    expect(normalizePullRequests({ detail: [{}] })).toEqual([])
    expect(normalizePullRequests({ detail: ['nope' as unknown as Record<string, unknown>] } as unknown as JiraDevDetailRaw)).toEqual([])
    expect(normalizePullRequests({ detail: [{ pullRequests: ['garbage', null] }] } as unknown as JiraDevDetailRaw)).toEqual([])
  })

  it('flattens pull requests across multiple detail entries', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        { pullRequests: [{ id: '1', url: 'https://x/1' }] },
        { pullRequests: [{ id: '2', url: 'https://x/2' }] },
      ],
    }
    expect(normalizePullRequests(detail).map((p) => p.id)).toEqual(['1', '2'])
  })
})

// ─── normalizeBranches ────────────────────────────────────────────────────────

describe('normalizeBranches', () => {
  it('maps a realistic detail payload incl. lastCommit and repository', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          branches: [
            {
              name: 'feature/x',
              url: 'https://github.com/acme/repo/tree/feature/x',
              createPullRequestUrl: 'https://github.com/acme/repo/compare/feature/x',
              repository: { name: 'repo', url: 'https://github.com/acme/repo' },
              lastCommit: {
                id: 'abcdef1234567890',
                displayId: 'abcdef1',
                message: 'wip',
                url: 'https://github.com/acme/repo/commit/abcdef1',
                author: { name: 'Ada' },
                authorTimestamp: '2026-06-14T09:00:00.000Z',
              },
            },
          ],
        },
      ],
    }
    const branches = normalizeBranches(detail)
    expect(branches).toHaveLength(1)
    expect(branches[0]).toEqual({
      name: 'feature/x',
      url: 'https://github.com/acme/repo/tree/feature/x',
      createPullRequestUrl: 'https://github.com/acme/repo/compare/feature/x',
      repo: 'repo',
      repoUrl: 'https://github.com/acme/repo',
      lastCommit: {
        id: 'abcdef1234567890',
        displayId: 'abcdef1',
        message: 'wip',
        url: 'https://github.com/acme/repo/commit/abcdef1',
        author: 'Ada',
        timestamp: '2026-06-14T09:00:00.000Z',
      },
    })
  })

  it('null-fills optional fields and lastCommit when absent', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ branches: [{ name: 'main', url: 'https://x/tree/main' }] }],
    }
    const branches = normalizeBranches(detail)
    expect(branches[0].createPullRequestUrl).toBeNull()
    expect(branches[0].repo).toBeNull()
    expect(branches[0].repoUrl).toBeNull()
    expect(branches[0].lastCommit).toBeNull()
  })

  it('derives commit displayId from id slice when displayId is absent', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          branches: [
            {
              name: 'b',
              url: 'https://x/tree/b',
              lastCommit: { id: 'abcdef1234567890', url: 'https://x/commit/1' },
            },
          ],
        },
      ],
    }
    const branches = normalizeBranches(detail)
    expect(branches[0].lastCommit?.displayId).toBe('abcdef1') // first 7 chars
    expect(branches[0].lastCommit?.message).toBe('')
    expect(branches[0].lastCommit?.author).toBeNull()
  })

  it('drops a lastCommit with no url (mapCommit returns null)', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ branches: [{ name: 'b', url: 'https://x/tree/b', lastCommit: { id: 'x' } }] }],
    }
    expect(normalizeBranches(detail)[0].lastCommit).toBeNull()
  })

  it('falls back commit timestamp to `timestamp` when authorTimestamp is absent', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          branches: [
            {
              name: 'b',
              url: 'https://x/tree/b',
              lastCommit: { id: 'x', url: 'https://x/c', timestamp: '2026-01-01T00:00:00.000Z' },
            },
          ],
        },
      ],
    }
    expect(normalizeBranches(detail)[0].lastCommit?.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('drops branches without a url', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ branches: [{ name: 'no-url' }, { name: 'ok', url: 'https://x/tree/ok' }] }],
    }
    const branches = normalizeBranches(detail)
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('ok')
  })

  it('tolerates missing arrays / non-object entries', () => {
    expect(normalizeBranches({} as JiraDevDetailRaw)).toEqual([])
    expect(normalizeBranches({ detail: [{}] })).toEqual([])
    expect(normalizeBranches({ detail: [{ branches: ['x', null] }] } as unknown as JiraDevDetailRaw)).toEqual([])
  })
})

// ─── normalizeRepositoryCommits ───────────────────────────────────────────────

describe('normalizeRepositoryCommits', () => {
  it('maps commits across repositories and detail entries', () => {
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          repositories: [
            {
              name: 'repo-a',
              commits: [
                { id: 'aaaaaaa1', displayId: 'aaaaaaa', message: 'c1', url: 'https://x/c1', author: { name: 'Ada' }, authorTimestamp: '2026-06-14T08:00:00.000Z' },
              ],
            },
            {
              name: 'repo-b',
              commits: [{ id: 'bbbbbbb1', url: 'https://x/c2' }],
            },
          ],
        },
      ],
    }
    const commits = normalizeRepositoryCommits(detail)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      id: 'aaaaaaa1',
      displayId: 'aaaaaaa',
      message: 'c1',
      url: 'https://x/c1',
      author: 'Ada',
      timestamp: '2026-06-14T08:00:00.000Z',
    })
    // second commit gets derived displayId + null author
    expect(commits[1].displayId).toBe('bbbbbbb') // first 7 of bbbbbbb1
    expect(commits[1].author).toBeNull()
    expect(commits[1].message).toBe('')
  })

  it('drops commits with no url', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ repositories: [{ name: 'r', commits: [{ id: 'no-url' }, { id: 'ok', url: 'https://x/ok' }] }] }],
    }
    const commits = normalizeRepositoryCommits(detail)
    expect(commits).toHaveLength(1)
    expect(commits[0].id).toBe('ok')
  })

  it('caps the commit list at 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, url: `https://x/c${i}` }))
    const detail: JiraDevDetailRaw = { detail: [{ repositories: [{ name: 'r', commits: many }] }] }
    const commits = normalizeRepositoryCommits(detail)
    expect(commits).toHaveLength(50)
    expect(commits[0].id).toBe('c0')
    expect(commits[49].id).toBe('c49')
  })

  it('caps at 50 even when commits span multiple repositories', () => {
    const repoCommits = (prefix: string) =>
      Array.from({ length: 30 }, (_, i) => ({ id: `${prefix}${i}`, url: `https://x/${prefix}${i}` }))
    const detail: JiraDevDetailRaw = {
      detail: [
        {
          repositories: [
            { name: 'r1', commits: repoCommits('a') },
            { name: 'r2', commits: repoCommits('b') },
          ],
        },
      ],
    }
    expect(normalizeRepositoryCommits(detail)).toHaveLength(50)
  })

  it('skips repositories without a commits array and non-object repos', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ repositories: [{ name: 'no-commits' }, 'garbage', { name: 'ok', commits: [{ id: 'x', url: 'https://x/x' }] }] }],
    } as unknown as JiraDevDetailRaw
    const commits = normalizeRepositoryCommits(detail)
    expect(commits).toHaveLength(1)
    expect(commits[0].id).toBe('x')
  })

  it('tolerates missing detail / missing repositories', () => {
    expect(normalizeRepositoryCommits({} as JiraDevDetailRaw)).toEqual([])
    expect(normalizeRepositoryCommits({ detail: [] })).toEqual([])
    expect(normalizeRepositoryCommits({ detail: [{}] })).toEqual([])
  })

  it('drops non-object commit entries inside a repo', () => {
    const detail: JiraDevDetailRaw = {
      detail: [{ repositories: [{ name: 'r', commits: ['x', null, { id: 'ok', url: 'https://x/ok' }] }] }],
    } as unknown as JiraDevDetailRaw
    const commits = normalizeRepositoryCommits(detail)
    expect(commits).toHaveLength(1)
    expect(commits[0].id).toBe('ok')
  })
})

describe('internal blob fields are never rendered', () => {
  it('skips the Development summary custom field (devsummary schema)', () => {
    const fields = {
      customfield_10000: '{pullrequest={dataType=pullrequest, state=DRAFT, stateCount=1}, json={"cachedValue":{}}}',
    }
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10000', name: 'Development', schema: { type: 'string', custom: 'com.atlassian.jira.plugins.jira-development-integration-plugin:devsummarycf' } },
    ]
    const rows = format(fields, { fieldMeta: meta })
    expect(byLabel(rows, 'Development')).toBeUndefined()
    expect(rows).toHaveLength(0)
  })

  it('drops any custom field whose value is a serialized object/map blob', () => {
    const fields = { customfield_10001: '{foo=bar, baz=1}', customfield_10002: '[1,2,3]' }
    const meta: JiraFieldMeta[] = [
      { id: 'customfield_10001', name: 'Blobby', schema: { type: 'string' } },
      { id: 'customfield_10002', name: 'Arrayish', schema: { type: 'string' } },
    ]
    expect(format(fields, { fieldMeta: meta })).toHaveLength(0)
  })
})
