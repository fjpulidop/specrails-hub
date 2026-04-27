import { spawnSync } from 'child_process'

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

export type Platform = 'darwin' | 'win32' | 'linux'

export interface SetupPrerequisite {
  key: 'node' | 'npm' | 'npx' | 'git'
  label: string
  command: string
  required: boolean
  installed: boolean
  version?: string
  /** Semver `major.minor.patch` minimum. Undefined = no minimum (e.g. npx). */
  minVersion?: string
  /** True when `installed` and (no minVersion OR parsed version >= minVersion). */
  meetsMinimum: boolean
  installUrl: string
  installHint: string
}

export interface SetupPrerequisitesStatus {
  ok: boolean
  platform: Platform
  prerequisites: SetupPrerequisite[]
  missingRequired: SetupPrerequisite[]
}

export const MIN_VERSIONS: Record<'node' | 'npm' | 'git', string> = {
  node: '18.0.0',
  npm: '9.0.0',
  git: '2.20.0',
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

/** Extracts the first `major.minor.patch` triple from a version string.
 *  Tolerates prefixes like `v`, `git version `, `node `. */
export function parseSemver(raw: string | undefined): [number, number, number] | null {
  if (!raw) return null
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

function meetsMinimumVersion(version: string | undefined, minVersion: string | undefined): boolean {
  if (!minVersion) return true
  if (!version) return false
  return compareVersions(version, minVersion) >= 0
}

export function getSetupPrerequisitesStatus(): SetupPrerequisitesStatus {
  const platform: Platform = process.platform === 'darwin'
    ? 'darwin'
    : process.platform === 'win32'
      ? 'win32'
      : 'linux'

  const definitions: Array<Omit<SetupPrerequisite, 'installed' | 'version' | 'meetsMinimum'>> = [
    {
      key: 'node',
      label: 'Node.js',
      command: 'node',
      required: true,
      minVersion: MIN_VERSIONS.node,
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
      minVersion: MIN_VERSIONS.npm,
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
      minVersion: MIN_VERSIONS.git,
      installUrl: process.platform === 'win32'
        ? 'https://git-scm.com/download/win'
        : 'https://git-scm.com/downloads',
      installHint: process.platform === 'win32'
        ? 'Install Git for Windows and enable the option that adds Git to PATH, then restart SpecRails Hub.'
        : 'Install Git and restart SpecRails Hub if PATH changed.',
    },
  ]

  const prerequisites: SetupPrerequisite[] = definitions.map((definition) => {
    const installed = commandExists(definition.command)
    const version = installed ? commandVersion(definition.command) : undefined
    const meetsMinimum = installed && meetsMinimumVersion(version, definition.minVersion)
    return { ...definition, installed, version, meetsMinimum }
  })

  // A required tool counts as missing if not installed OR below its minimum version.
  const missingRequired = prerequisites.filter(
    (item) => item.required && (!item.installed || !item.meetsMinimum),
  )

  return {
    ok: missingRequired.length === 0,
    platform,
    prerequisites,
    missingRequired,
  }
}

export function formatMissingSetupPrerequisites(status = getSetupPrerequisitesStatus()): string | null {
  if (status.ok) return null

  return [
    'SpecRails setup needs a few developer tools before it can install this project.',
    '',
    ...status.missingRequired.map((item) => {
      if (!item.installed) {
        return `- ${item.label} (${item.command}) is not on PATH. ${item.installHint}`
      }
      // installed but below minimum version
      return `- ${item.label} ${item.version ?? '?'} found, but version ${item.minVersion}+ is required. ${item.installHint}`
    }),
    '',
    'Install the missing tools, restart SpecRails Hub, then retry setup.',
  ].join('\n')
}
