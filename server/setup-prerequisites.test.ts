import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}))

import { spawnSync } from 'child_process'
import {
  compareVersions,
  formatMissingSetupPrerequisites,
  getSetupPrerequisitesStatus,
  parseSemver,
  type SetupPrerequisitesStatus,
} from './setup-prerequisites'

const mockSpawnSync = vi.mocked(spawnSync)

describe('setup prerequisites', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reports all required tools as installed with versions when versions meet minimums', () => {
    mockSpawnSync.mockImplementation((cmd: any) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0 } as any
      // Return versions above the configured minimums (node 18, npm 9, git 2.20)
      if (cmd === 'node') return { status: 0, stdout: 'v20.11.0\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.2.4\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '10.2.4\n', stderr: '' } as any
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      // Providers: claude has no minVersion (any executable version is fine);
      // codex has min 0.128.0, so feed something ≥ that.
      if (cmd === 'claude') return { status: 0, stdout: '1.2.3\n', stderr: '' } as any
      if (cmd === 'codex') return { status: 0, stdout: 'codex-cli 0.128.0\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(true)
    expect(status.missingRequired).toEqual([])
    const tools = status.prerequisites.filter((p) => p.kind === 'tool')
    expect(tools).toHaveLength(4)
    expect(tools.map((item) => item.command)).toEqual(['node', 'npm', 'npx', 'git'])
    expect(tools.every((item) => item.installed)).toBe(true)
    expect(tools.every((item) => item.executable)).toBe(true)
    expect(tools.every((item) => item.meetsMinimum)).toBe(true)
    expect(tools.find((item) => item.command === 'git')?.version).toBe('git version 2.42.1')
    // At least one provider is usable, satisfying the at-least-one-provider rule
    const providers = status.prerequisites.filter((p) => p.kind === 'provider')
    expect(providers.some((p) => p.installed && p.executable && p.meetsMinimum)).toBe(true)
  })

  it('reports platform field matching process.platform', () => {
    mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: 'v20.0.0\n', stderr: '' } as any))
    const status = getSetupPrerequisitesStatus()
    const expected = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
    expect(status.platform).toBe(expected)
  })

  it('flags an installed-but-too-old Node as missing via meetsMinimum=false', () => {
    mockSpawnSync.mockImplementation((cmd: any) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0 } as any
      if (cmd === 'node') return { status: 0, stdout: 'v14.21.3\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    expect(status.missingRequired.map((item) => item.command)).toContain('node')
    const node = status.prerequisites.find((item) => item.command === 'node')
    expect(node?.installed).toBe(true)
    expect(node?.meetsMinimum).toBe(false)
    expect(node?.version).toBe('v14.21.3')
    expect(node?.minVersion).toBe('18.0.0')
  })

  it('treats npx without minVersion as meeting any version requirement', () => {
    mockSpawnSync.mockImplementation((cmd: any) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0 } as any
      if (cmd === 'node') return { status: 0, stdout: 'v20.0.0\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '5.0.0\n', stderr: '' } as any
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()
    const npx = status.prerequisites.find((item) => item.command === 'npx')
    expect(npx?.minVersion).toBeUndefined()
    expect(npx?.meetsMinimum).toBe(true)
  })

  it('reports missing Git without probing its version', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: args[0] === 'git' ? 1 : 0 } as any
      }
      // Return versions that meet the minimums for non-git tools
      if (cmd === 'node') return { status: 0, stdout: 'v20.0.0\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      // Ensure at least one provider is usable so the at-least-one-provider
      // rule does NOT add the providers to missingRequired (we want this test
      // to assert that git alone is missing).
      if (cmd === 'claude') return { status: 0, stdout: '1.0.0\n', stderr: '' } as any
      if (cmd === 'codex') return { status: 0, stdout: '0.128.0\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    expect(status.missingRequired.map((item) => item.command)).toEqual(['git'])
    expect(mockSpawnSync).not.toHaveBeenCalledWith('git', ['--version'], expect.anything())
  })

  it('treats version-probe failures as not executable (broken-symlink detection)', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        if (args[0] === 'node') return { error: new Error('lookup failed') } as any
        return { status: 0, stdout: `/usr/local/bin/${args[0]}\n`, stderr: '' } as any
      }
      if (cmd === '/usr/local/bin/npm') return { status: 1, stdout: '', stderr: 'npm failed' } as any
      if (cmd === '/usr/local/bin/npx') return { error: new Error('version failed') } as any
      if (cmd === '/usr/local/bin/git') return { status: 0, stdout: undefined, stderr: 'git version 2.50.0\n' } as any
      return { status: 0, stdout: undefined, stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    // node: not installed (which failed). npm/npx: which found them, version probe failed → executable=false.
    expect(status.missingRequired.map((item) => item.command).sort()).toEqual(['node', 'npm', 'npx'].sort())

    const node = status.prerequisites.find((item) => item.command === 'node')
    expect(node?.installed).toBe(false)
    expect(node?.executable).toBe(false)

    const npm = status.prerequisites.find((item) => item.command === 'npm')
    expect(npm?.installed).toBe(true)
    expect(npm?.executable).toBe(false)
    expect(npm?.version).toBeUndefined()
    expect(npm?.meetsMinimum).toBe(false)
    expect(npm?.installHint).toMatch(/failed to execute/)

    const git = status.prerequisites.find((item) => item.command === 'git')
    expect(git?.executable).toBe(true)
    expect(git?.version).toBe('git version 2.50.0')
  })

  it('flags installed-but-unexecutable Node distinctly from not-installed', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: `/usr/local/bin/${args[0]}\n`, stderr: '' } as any
      }
      if (cmd === '/usr/local/bin/node') return { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } as any
      if (cmd === '/usr/local/bin/npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === '/usr/local/bin/npx') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === '/usr/local/bin/git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()
    const node = status.prerequisites.find((item) => item.command === 'node')
    expect(node?.installed).toBe(true)
    expect(node?.executable).toBe(false)
    expect(node?.meetsMinimum).toBe(false)
    expect(node?.resolvedPath).toBe('/usr/local/bin/node')
    expect(node?.installHint).toMatch(/broken symlink/)
  })

  it('quotes resolved paths containing whitespace on win32 (Program Files)', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (cmd === 'where' || cmd === 'which') {
          if (args[0] === 'git') return { status: 0, stdout: 'C:\\Program Files\\Git\\cmd\\git.exe\r\n', stderr: '' } as any
          return { status: 0, stdout: `C:\\nodejs\\${args[0]}.cmd\r\n`, stderr: '' } as any
        }
        if (cmd === '"C:\\Program Files\\Git\\cmd\\git.exe"') {
          return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
        }
        if (cmd === 'C:\\nodejs\\node.cmd') return { status: 0, stdout: 'v20.11.0\n', stderr: '' } as any
        if (cmd === 'C:\\nodejs\\npm.cmd') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
        if (cmd === 'C:\\nodejs\\npx.cmd') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
        // Provider CLIs on win32 — keep at least one usable so this test (which
        // is about path-quoting for tools) is not gated by the provider rule.
        if (cmd === 'C:\\nodejs\\claude.cmd') return { status: 0, stdout: '1.0.0\n', stderr: '' } as any
        if (cmd === 'C:\\nodejs\\codex.cmd') return { status: 0, stdout: '0.128.0\n', stderr: '' } as any
        return { status: 1, stdout: '', stderr: 'unquoted path' } as any
      })

      const status = getSetupPrerequisitesStatus()
      const git = status.prerequisites.find((item) => item.command === 'git')
      expect(git?.executable).toBe(true)
      expect(git?.version).toBe('git version 2.42.1')
      expect(status.ok).toBe(true)
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it('marks all providers missingRequired when zero provider CLIs are usable', () => {
    mockSpawnSync.mockImplementation((cmd: any) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0 } as any
      if (cmd === 'node') return { status: 0, stdout: 'v20.0.0\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      // Both providers fail their version probe → unusable
      if (cmd === 'claude' || cmd === 'codex') return { status: 1, stdout: '', stderr: 'auth missing' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()
    expect(status.ok).toBe(false)
    const missingProviders = status.missingRequired
      .filter((p) => p.kind === 'provider')
      .map((p) => p.key)
      .sort()
    expect(missingProviders).toEqual(['claude', 'codex'])
  })

  it('does NOT block when at least one provider is usable', () => {
    mockSpawnSync.mockImplementation((cmd: any) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0 } as any
      if (cmd === 'node') return { status: 0, stdout: 'v20.0.0\n', stderr: '' } as any
      if (cmd === 'npm') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'npx') return { status: 0, stdout: '10.0.0\n', stderr: '' } as any
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.42.1\n', stderr: '' } as any
      if (cmd === 'claude') return { status: 0, stdout: '1.2.3\n', stderr: '' } as any
      // Codex too old → not usable
      if (cmd === 'codex') return { status: 0, stdout: '0.100.0\n', stderr: '' } as any
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()
    expect(status.ok).toBe(true)
    expect(status.missingRequired).toEqual([])
    const codex = status.prerequisites.find((p) => p.key === 'codex')
    expect(codex?.installed).toBe(true)
    expect(codex?.executable).toBe(true)
    expect(codex?.meetsMinimum).toBe(false)
  })

  it('formats missing prerequisite guidance and returns null when ready', () => {
    const ready: SetupPrerequisitesStatus = {
      ok: true,
      prerequisites: [],
      missingRequired: [],
    }
    const missing: SetupPrerequisitesStatus = {
      ok: false,
      platform: 'darwin',
      prerequisites: [],
      missingRequired: [
        {
          key: 'git',
          kind: 'tool',
          label: 'Git',
          command: 'git',
          required: true,
          installed: false,
          executable: false,
          meetsMinimum: false,
          installUrl: 'https://git-scm.com/downloads',
          installHint: 'Install Git and restart SpecRails Hub.',
        },
      ],
    }

    expect(formatMissingSetupPrerequisites(ready)).toBeNull()
    expect(formatMissingSetupPrerequisites(missing)).toContain('Git (git) is not on PATH')
    expect(formatMissingSetupPrerequisites(missing)).toContain('restart SpecRails Hub')
  })
})

describe('parseSemver', () => {
  it('extracts semver triple from common formats', () => {
    expect(parseSemver('v18.0.0')).toEqual([18, 0, 0])
    expect(parseSemver('20.11.0')).toEqual([20, 11, 0])
    expect(parseSemver('git version 2.42.1')).toEqual([2, 42, 1])
    expect(parseSemver('node v18.17.1\nextra')).toEqual([18, 17, 1])
  })

  it('returns null for unparseable input', () => {
    expect(parseSemver(undefined)).toBeNull()
    expect(parseSemver('')).toBeNull()
    expect(parseSemver('not a version')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('returns positive when a > b, negative when a < b, zero when equal', () => {
    expect(compareVersions('20.0.0', '18.0.0')).toBeGreaterThan(0)
    expect(compareVersions('14.21.3', '18.0.0')).toBeLessThan(0)
    expect(compareVersions('18.0.0', '18.0.0')).toBe(0)
    expect(compareVersions('git version 2.42.1', '2.20.0')).toBeGreaterThan(0)
  })

  it('returns 0 for unparseable inputs (conservative)', () => {
    expect(compareVersions('weird', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'weird')).toBe(0)
  })
})
