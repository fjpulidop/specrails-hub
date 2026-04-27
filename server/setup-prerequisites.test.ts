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
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(true)
    expect(status.missingRequired).toEqual([])
    expect(status.prerequisites).toHaveLength(4)
    expect(status.prerequisites.map((item) => item.command)).toEqual(['node', 'npm', 'npx', 'git'])
    expect(status.prerequisites.every((item) => item.installed)).toBe(true)
    expect(status.prerequisites.every((item) => item.meetsMinimum)).toBe(true)
    expect(status.prerequisites.find((item) => item.command === 'git')?.version).toBe('git version 2.42.1')
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
      return { status: 0, stdout: '', stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    expect(status.missingRequired.map((item) => item.command)).toEqual(['git'])
    expect(mockSpawnSync).not.toHaveBeenCalledWith('git', ['--version'], expect.anything())
  })

  it('treats version-probe failures as not meeting the minimum (conservative)', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        if (args[0] === 'node') return { error: new Error('lookup failed') } as any
        return { status: 0 } as any
      }
      if (cmd === 'npm') return { status: 1, stdout: '', stderr: 'npm failed' } as any
      if (cmd === 'npx') return { error: new Error('version failed') } as any
      return { status: 0, stdout: undefined, stderr: 'git version 2.50.0\n' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    // node not installed; npm installed but version probe failed → meetsMinimum=false → flagged.
    // npx has no minVersion, so an undefined version is still treated as meeting the requirement.
    expect(status.missingRequired.map((item) => item.command).sort()).toEqual(['node', 'npm'].sort())
    const npm = status.prerequisites.find((item) => item.command === 'npm')
    expect(npm?.installed).toBe(true)
    expect(npm?.version).toBeUndefined()
    expect(npm?.meetsMinimum).toBe(false)
    expect(status.prerequisites.find((item) => item.command === 'git')?.version).toBe('git version 2.50.0')
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
          label: 'Git',
          command: 'git',
          required: true,
          installed: false,
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
