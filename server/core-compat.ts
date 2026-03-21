import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { CHECKPOINTS } from './setup-manager'

// These must mirror KNOWN_VERBS in cli/specrails-hub.ts
const HUB_KNOWN_COMMANDS = new Set([
  'implement',
  'batch-implement',
  'why',
  'product-backlog',
  'update-product-driven-backlog',
  'refactor-recommender',
  'health-check',
  'compat-check',
])

// v1.0: cli.initArgs / cli.updateArgs (flat)
// v2.0: cli.claude / cli.codex (per-provider objects) + specrailsDir
interface IntegrationContract {
  schemaVersion: string
  coreVersion: string
  minimumHubVersion: string
  provider?: string
  cli: {
    // v1.0 fields
    initArgs?: string[]
    updateArgs?: string[]
    // v2.0 fields
    claude?: { binary: string; initArgs: string[] }
    codex?: { binary: string; initArgs: string[] }
  }
  specrailsDir?: { claude: string; codex: string }
  checkpoints: string[]
  commands: string[]
}

export interface CoreCompatResult {
  compatible: boolean
  coreVersion: string | null
  hubVersion: string
  missingCheckpoints: string[]
  extraCheckpoints: string[]
  missingCommands: string[]
  extraCommands: string[]
  contractFound: boolean
}

export async function findCoreContract(): Promise<string | null> {
  // Strategy 1: Try require.resolve (works for local installs)
  try {
    const contractPath = require.resolve('specrails-core/integration-contract.json')
    if (fs.existsSync(contractPath)) return contractPath
  } catch { /* not locally installed */ }

  // Strategy 2: npm root -g
  try {
    const globalRoot = execSync('npm root -g', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    const contractPath = path.join(globalRoot, 'specrails-core', 'integration-contract.json')
    if (fs.existsSync(contractPath)) return contractPath
  } catch { /* npm not available or failed */ }

  return null
}

// ─── CLI detection ────────────────────────────────────────────────────────────

export type CLIProvider = 'claude' | 'codex'

/**
 * Synchronously detect which AI CLI is available in the user's PATH.
 * Prefers Claude Code if both are present.
 * Returns null if neither is found.
 */
export function detectCLISync(): CLIProvider | null {
  try {
    execSync('which claude', { stdio: 'ignore' })
    return 'claude'
  } catch { /* not found */ }
  try {
    execSync('which codex', { stdio: 'ignore' })
    return 'codex'
  } catch { /* not found */ }
  return null
}

/**
 * Async wrapper around detectCLISync for callers that prefer Promise-based API.
 */
export async function detectCLI(): Promise<CLIProvider | null> {
  return detectCLISync()
}

export interface CLIStatus {
  provider: CLIProvider | null
  version: string | null
}

/**
 * Detect the active CLI and its version.
 */
export function getCLIStatus(): CLIStatus {
  const provider = detectCLISync()
  if (!provider) return { provider: null, version: null }

  try {
    const versionFlag = provider === 'codex' ? '--version' : '--version'
    const raw = execSync(`${provider} ${versionFlag}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim()
    // Extract semver-like token from output (e.g. "Claude Code 1.2.3" → "1.2.3")
    const match = raw.match(/\d+\.\d+\.\d+[\w.-]*/)
    return { provider, version: match ? match[0] : raw }
  } catch {
    return { provider, version: null }
  }
}

function readHubVersion(): string {
  // __dirname is server/ in dev (tsx) or server/dist/ when compiled
  const candidates = [
    path.join(__dirname, '..', 'package.json'),       // from server/ (dev)
    path.join(__dirname, '..', '..', 'package.json'), // from server/dist/ (compiled)
  ]
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { name?: string; version?: string }
      if (pkg.name === 'specrails-hub' && pkg.version) return pkg.version
    } catch { /* skip */ }
  }
  return 'unknown'
}

export async function checkCoreCompat(): Promise<CoreCompatResult> {
  const hubVersion = readHubVersion()
  const contractPath = await findCoreContract()

  if (!contractPath) {
    return {
      compatible: true,
      coreVersion: null,
      hubVersion,
      missingCheckpoints: [],
      extraCheckpoints: [],
      missingCommands: [],
      extraCommands: [],
      contractFound: false,
    }
  }

  const contract: IntegrationContract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'))

  const hubCheckpointKeys = CHECKPOINTS.map((cp) => cp.key)
  const contractCheckpoints = contract.checkpoints

  const missingCheckpoints = contractCheckpoints.filter((c) => !hubCheckpointKeys.includes(c))
  const extraCheckpoints = hubCheckpointKeys.filter((k) => !contractCheckpoints.includes(k))

  const contractCommands = contract.commands
  const missingCommands = contractCommands.filter((c) => !HUB_KNOWN_COMMANDS.has(c))
  const extraCommands = [...HUB_KNOWN_COMMANDS].filter((c) => !contractCommands.includes(c))

  const compatible =
    missingCheckpoints.length === 0 &&
    extraCheckpoints.length === 0 &&
    missingCommands.length === 0 &&
    extraCommands.length === 0

  return {
    compatible,
    coreVersion: contract.coreVersion,
    hubVersion,
    missingCheckpoints,
    extraCheckpoints,
    missingCommands,
    extraCommands,
    contractFound: true,
  }
}
