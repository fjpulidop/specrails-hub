import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}))

import { spawnSync } from 'child_process'
import {
  formatMissingSetupPrerequisites,
  getSetupPrerequisitesStatus,
  type SetupPrerequisitesStatus,
} from './setup-prerequisites'

const mockSpawnSync = vi.mocked(spawnSync)

describe('setup prerequisites', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reports all required tools as installed with versions', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which') return { status: 0 } as any
      return { status: 0, stdout: `${cmd} v1.2.3\nextra\n`, stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(true)
    expect(status.missingRequired).toEqual([])
    expect(status.prerequisites).toHaveLength(4)
    expect(status.prerequisites.map((item) => item.command)).toEqual(['node', 'npm', 'npx', 'git'])
    expect(status.prerequisites.every((item) => item.installed)).toBe(true)
    expect(status.prerequisites.find((item) => item.command === 'git')?.version).toBe('git v1.2.3')
  })

  it('reports missing Git without probing its version', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which') {
        return { status: args[0] === 'git' ? 1 : 0 } as any
      }
      return { status: 0, stdout: `${cmd} v1.2.3\n`, stderr: '' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    expect(status.missingRequired.map((item) => item.command)).toEqual(['git'])
    expect(mockSpawnSync).not.toHaveBeenCalledWith('git', ['--version'], expect.anything())
  })

  it('handles command lookup and version failures conservatively', () => {
    mockSpawnSync.mockImplementation((cmd: any, args: any) => {
      if (cmd === 'which') {
        if (args[0] === 'node') return { error: new Error('lookup failed') } as any
        return { status: 0 } as any
      }
      if (cmd === 'npm') return { status: 1, stdout: '', stderr: 'npm failed' } as any
      if (cmd === 'npx') return { error: new Error('version failed') } as any
      return { status: 0, stdout: undefined, stderr: 'git version 2.50.0\n' } as any
    })

    const status = getSetupPrerequisitesStatus()

    expect(status.ok).toBe(false)
    expect(status.missingRequired.map((item) => item.command)).toEqual(['node'])
    expect(status.prerequisites.find((item) => item.command === 'npm')?.version).toBeUndefined()
    expect(status.prerequisites.find((item) => item.command === 'npx')?.version).toBeUndefined()
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
      prerequisites: [],
      missingRequired: [
        {
          key: 'git',
          label: 'Git',
          command: 'git',
          required: true,
          installed: false,
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
