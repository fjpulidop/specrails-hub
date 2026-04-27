import { spawnSync } from 'child_process'

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

export interface SetupPrerequisite {
  key: 'node' | 'npm' | 'npx' | 'git'
  label: string
  command: string
  required: boolean
  installed: boolean
  version?: string
  installUrl: string
  installHint: string
}

export interface SetupPrerequisitesStatus {
  ok: boolean
  prerequisites: SetupPrerequisite[]
  missingRequired: SetupPrerequisite[]
}

function commandExists(command: string): boolean {
  const result = spawnSync(WHICH_CMD, [command], {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'ignore',
  })
  return !result.error && (result.status ?? 1) === 0
}

function commandVersion(command: string): string | undefined {
  const result = spawnSync(command, ['--version'], {
    env: process.env,
    shell: process.platform === 'win32',
    encoding: 'utf-8',
    timeout: 5_000,
  })
  if (result.error || (result.status ?? 1) !== 0) return undefined
  const output = `${result.stdout ?? result.stderr ?? ''}`.trim()
  return output.split(/\r?\n/)[0]?.trim() || undefined
}

export function getSetupPrerequisitesStatus(): SetupPrerequisitesStatus {
  const definitions: Array<Omit<SetupPrerequisite, 'installed' | 'version'>> = [
    {
      key: 'node',
      label: 'Node.js',
      command: 'node',
      required: true,
      installUrl: 'https://nodejs.org/en/download',
      installHint: process.platform === 'win32'
        ? 'Install Node.js LTS, then restart SpecRails Hub so Windows refreshes PATH.'
        : 'Install Node.js LTS, then restart SpecRails Hub so PATH is refreshed.',
    },
    {
      key: 'npm',
      label: 'npm',
      command: 'npm',
      required: true,
      installUrl: 'https://nodejs.org/en/download',
      installHint: 'npm ships with Node.js LTS.',
    },
    {
      key: 'npx',
      label: 'npx',
      command: 'npx',
      required: true,
      installUrl: 'https://nodejs.org/en/download',
      installHint: 'npx ships with npm and is required to run specrails-core.',
    },
    {
      key: 'git',
      label: 'Git',
      command: 'git',
      required: true,
      installUrl: process.platform === 'win32'
        ? 'https://git-scm.com/download/win'
        : 'https://git-scm.com/downloads',
      installHint: process.platform === 'win32'
        ? 'Install Git for Windows and enable the option that adds Git to PATH, then restart SpecRails Hub.'
        : 'Install Git and restart SpecRails Hub if PATH changed.',
    },
  ]

  const prerequisites = definitions.map((definition) => {
    const installed = commandExists(definition.command)
    return {
      ...definition,
      installed,
      version: installed ? commandVersion(definition.command) : undefined,
    }
  })
  const missingRequired = prerequisites.filter((item) => item.required && !item.installed)
  return {
    ok: missingRequired.length === 0,
    prerequisites,
    missingRequired,
  }
}

export function formatMissingSetupPrerequisites(status = getSetupPrerequisitesStatus()): string | null {
  if (status.ok) return null

  return [
    'SpecRails setup needs a few developer tools before it can install this project.',
    '',
    ...status.missingRequired.map((item) => `- ${item.label} (${item.command}) is not on PATH. ${item.installHint}`),
    '',
    'Install the missing tools, restart SpecRails Hub, then retry setup.',
  ].join('\n')
}
