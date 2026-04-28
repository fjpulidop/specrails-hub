import { spawnSync } from 'child_process'

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

export type Platform = 'darwin' | 'win32' | 'linux'

export interface SetupPrerequisite {
  key: 'node' | 'npm' | 'npx' | 'git'
  label: string
  command: string
  required: boolean
  installed: boolean
  /** True when `installed` AND `<command> --version` exits 0. */
  executable: boolean
  version?: string
  /** Absolute path returned by `which`, when found. Used for diagnostics. */
  resolvedPath?: string
  /** Raw failure detail when `installed && !executable`. Used for diagnostics. */
  executionError?: string
  /** Semver `major.minor.patch` minimum. Undefined = no minimum (e.g. npx). */
  minVersion?: string
  /** True when `installed` AND `executable` AND (no minVersion OR parsed version >= minVersion). */
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

interface CommandLookup {
  found: boolean
  resolvedPath?: string
}

function locateCommand(command: string): CommandLookup {
  const result = spawnSync(WHICH_CMD, [command], {
    env: process.env,
    shell: process.platform === 'win32',
    encoding: 'utf-8',
  })
  if (result.error || (result.status ?? 1) !== 0) return { found: false }
  const resolvedPath = `${result.stdout ?? ''}`.trim().split(/\r?\n/)[0]?.trim() || undefined
  return { found: true, resolvedPath }
}

interface VersionProbe {
  executed: boolean
  version?: string
  error?: string
}

function probeVersion(command: string, resolvedPath?: string): VersionProbe {
  // IMPORTANT: prefer the absolute path returned by `which`. When the server is
  // bundled with `pkg`, calling spawn with the bare command name `'node'` is
  // intercepted by pkg's child_process patch and redirected to `process.execPath`
  // (the server binary itself) — the child then crashes with
  // `Cannot find module '/--version'` from pkg/prelude/bootstrap.js. Passing
  // an absolute path bypasses this interception.
  const target = resolvedPath || command
  const result = spawnSync(target, ['--version'], {
    env: process.env,
    shell: process.platform === 'win32',
    encoding: 'utf-8',
    timeout: 5_000,
  })
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException
    return { executed: false, error: `${err.code ?? 'ERR'}: ${err.message}` }
  }
  if ((result.status ?? 1) !== 0) {
    const stderr = `${result.stderr ?? ''}`.trim().slice(0, 400)
    const signal = result.signal ? ` signal=${result.signal}` : ''
    return { executed: false, error: `exit=${result.status ?? '?'}${signal}${stderr ? ` stderr=${stderr}` : ''}` }
  }
  const output = `${result.stdout ?? result.stderr ?? ''}`.trim()
  const version = output.split(/\r?\n/)[0]?.trim() || undefined
  return { executed: true, version }
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

function brokenSymlinkHint(label: string, command: string, resolvedPath: string | undefined): string {
  const where = resolvedPath ? ` at ${resolvedPath}` : ''
  return `${label} found${where} but failed to execute — possibly a broken symlink or a stale install. Reinstall ${command} or remove the stale link${resolvedPath ? ` at ${resolvedPath}` : ''}.`
}

export function getSetupPrerequisitesStatus(): SetupPrerequisitesStatus {
  const platform: Platform = process.platform === 'darwin'
    ? 'darwin'
    : process.platform === 'win32'
      ? 'win32'
      : 'linux'

  const definitions: Array<Omit<SetupPrerequisite, 'installed' | 'executable' | 'version' | 'resolvedPath' | 'meetsMinimum'>> = [
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
    const lookup = locateCommand(definition.command)
    const installed = lookup.found
    let executable = false
    let version: string | undefined
    let executionError: string | undefined
    if (installed) {
      const probe = probeVersion(definition.command, lookup.resolvedPath)
      executable = probe.executed
      version = probe.version
      executionError = probe.error
    }
    const meetsMinimum = installed && executable && meetsMinimumVersion(version, definition.minVersion)
    const installHint = installed && !executable
      ? brokenSymlinkHint(definition.label, definition.command, lookup.resolvedPath)
      : definition.installHint
    return {
      ...definition,
      installed,
      executable,
      version,
      resolvedPath: lookup.resolvedPath,
      executionError,
      meetsMinimum,
      installHint,
    }
  })

  // A required tool counts as missing if not installed, not executable, or below its minimum version.
  const missingRequired = prerequisites.filter(
    (item) => item.required && (!item.installed || !item.executable || !item.meetsMinimum),
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
      if (!item.executable) {
        return `- ${item.installHint}`
      }
      // installed and executable but below minimum version
      return `- ${item.label} ${item.version ?? '?'} found, but version ${item.minVersion}+ is required. ${item.installHint}`
    }),
    '',
    'Install the missing tools, restart SpecRails Hub, then retry setup.',
  ].join('\n')
}
