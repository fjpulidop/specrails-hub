import { describe, it, expect, beforeEach } from 'vitest'
import { register, getAdapter, hasAdapter, listAdapters, _clearForTests } from './registry'
import { UnknownProviderError, type ProviderAdapter } from './types'

function makeStubAdapter(id: string): ProviderAdapter {
  return {
    id,
    displayName: id,
    binary: id,
    minCliVersion: null,
    projectDirName: `.${id}`,
    instructionsFilename: `${id.toUpperCase()}.md`,
    mcpRegistration: 'project-json',
    capabilities: {
      nativeResume: false,
      nativeStreamJson: false,
      nativeCostUsd: false,
      nativeOtelEnv: false,
      profileEnvSupport: false,
      systemPromptArg: false,
    },
    modelCatalog: () => [{ value: 'stub', label: 'stub', default: true }],
    defaultModel: () => 'stub',
    buildArgs: () => [],
    parseStreamLine: () => null,
    extractResult: () => ({}),
    baselineAgents: () => [],
    detectInstalled: async () => ({ installed: false, executable: false }),
  }
}

describe('providerRegistry', () => {
  beforeEach(() => {
    _clearForTests()
  })

  it('register + getAdapter round-trips a registered adapter', () => {
    const stub = makeStubAdapter('alpha')
    register(stub)
    expect(getAdapter('alpha')).toBe(stub)
  })

  it('hasAdapter reflects registration', () => {
    expect(hasAdapter('beta')).toBe(false)
    register(makeStubAdapter('beta'))
    expect(hasAdapter('beta')).toBe(true)
  })

  it('listAdapters returns every registered adapter', () => {
    register(makeStubAdapter('one'))
    register(makeStubAdapter('two'))
    const ids = listAdapters().map((a) => a.id).sort()
    expect(ids).toEqual(['one', 'two'])
  })

  it('getAdapter throws UnknownProviderError for unknown ids and names the registered list', () => {
    register(makeStubAdapter('alpha'))
    register(makeStubAdapter('beta'))
    let err: UnknownProviderError | null = null
    try {
      getAdapter('ghost')
    } catch (e) {
      err = e as UnknownProviderError
    }
    expect(err).not.toBeNull()
    expect(err!.name).toBe('UnknownProviderError')
    expect(err!.unknownId).toBe('ghost')
    expect([...err!.registered].sort()).toEqual(['alpha', 'beta'])
    expect(err!.message).toContain('ghost')
    expect(err!.message).toContain('alpha')
    expect(err!.message).toContain('beta')
  })

  it('UnknownProviderError lists "(none)" when no adapters are registered', () => {
    let err: UnknownProviderError | null = null
    try {
      getAdapter('ghost')
    } catch (e) {
      err = e as UnknownProviderError
    }
    expect(err!.message).toContain('(none)')
  })

  it('_clearForTests empties the registry without affecting subsequent registrations', () => {
    register(makeStubAdapter('alpha'))
    expect(listAdapters()).toHaveLength(1)
    _clearForTests()
    expect(listAdapters()).toHaveLength(0)
    register(makeStubAdapter('beta'))
    expect(listAdapters()).toHaveLength(1)
  })

  it('re-registering the same id replaces the previous adapter', () => {
    const a = makeStubAdapter('alpha')
    const b = makeStubAdapter('alpha')
    register(a)
    register(b)
    expect(getAdapter('alpha')).toBe(b)
    expect(listAdapters()).toHaveLength(1)
  })
})
