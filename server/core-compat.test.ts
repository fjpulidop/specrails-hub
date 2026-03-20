import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({ execSync: vi.fn() }))

import { checkCoreCompat, findCoreContract } from './core-compat'
import { execSync } from 'child_process'

// Minimal valid contract matching hub constants
const COMPATIBLE_CONTRACT = {
  schemaVersion: '1',
  coreVersion: '1.0.0',
  minimumHubVersion: '1.0.0',
  cli: { initArgs: [], updateArgs: [] },
  checkpoints: [
    'base_install',
    'repo_analysis',
    'stack_conventions',
    'product_discovery',
    'agent_generation',
    'command_config',
    'final_verification',
  ],
  commands: [
    'implement',
    'batch-implement',
    'why',
    'product-backlog',
    'update-product-driven-backlog',
    'refactor-recommender',
    'health-check',
    'compat-check',
  ],
}

/**
 * Write contract JSON to a temp dir as `<tmpDir>/specrails-core/integration-contract.json`
 * and mock execSync to return tmpDir (simulating `npm root -g`).
 */
function setupContractInTmpDir(contract: object, tmpDir: string): string {
  const coreDir = path.join(tmpDir, 'specrails-core')
  fs.mkdirSync(coreDir, { recursive: true })
  const contractPath = path.join(coreDir, 'integration-contract.json')
  fs.writeFileSync(contractPath, JSON.stringify(contract))
  vi.mocked(execSync).mockReturnValue(tmpDir as any)
  return contractPath
}

describe('checkCoreCompat', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.restoreAllMocks()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-compat-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns compatible=true and contractFound=false when core is not installed', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(true)
    expect(result.contractFound).toBe(false)
    expect(result.coreVersion).toBeNull()
    expect(result.missingCheckpoints).toEqual([])
    expect(result.missingCommands).toEqual([])
  })

  it('returns compatible=true when contract exactly matches hub constants', async () => {
    setupContractInTmpDir(COMPATIBLE_CONTRACT, tmpDir)

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(true)
    expect(result.contractFound).toBe(true)
    expect(result.coreVersion).toBe('1.0.0')
    expect(result.missingCheckpoints).toEqual([])
    expect(result.extraCheckpoints).toEqual([])
    expect(result.missingCommands).toEqual([])
    expect(result.extraCommands).toEqual([])
  })

  it('detects drift when core adds a new checkpoint phase', async () => {
    const driftedContract = {
      ...COMPATIBLE_CONTRACT,
      checkpoints: [...COMPATIBLE_CONTRACT.checkpoints, 'new_phase_v2'],
    }
    setupContractInTmpDir(driftedContract, tmpDir)

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(false)
    expect(result.contractFound).toBe(true)
    expect(result.missingCheckpoints).toContain('new_phase_v2')
    expect(result.extraCheckpoints).toEqual([])
    expect(result.missingCommands).toEqual([])
  })

  it('detects drift when hub has a checkpoint that core dropped', async () => {
    const driftedContract = {
      ...COMPATIBLE_CONTRACT,
      checkpoints: COMPATIBLE_CONTRACT.checkpoints.filter((c) => c !== 'final_verification'),
    }
    setupContractInTmpDir(driftedContract, tmpDir)

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(false)
    expect(result.extraCheckpoints).toContain('final_verification')
    expect(result.missingCheckpoints).toEqual([])
  })

  it('detects drift when core adds a new command verb', async () => {
    const driftedContract = {
      ...COMPATIBLE_CONTRACT,
      commands: [...COMPATIBLE_CONTRACT.commands, 'new-command'],
    }
    setupContractInTmpDir(driftedContract, tmpDir)

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(false)
    expect(result.missingCommands).toContain('new-command')
    expect(result.extraCommands).toEqual([])
  })

  it('detects drift when hub has a command that core dropped', async () => {
    const driftedContract = {
      ...COMPATIBLE_CONTRACT,
      commands: COMPATIBLE_CONTRACT.commands.filter((c) => c !== 'health-check'),
    }
    setupContractInTmpDir(driftedContract, tmpDir)

    const result = await checkCoreCompat()

    expect(result.compatible).toBe(false)
    expect(result.extraCommands).toContain('health-check')
    expect(result.missingCommands).toEqual([])
  })

  it('reports hubVersion from package.json', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })

    const result = await checkCoreCompat()

    expect(result.hubVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('findCoreContract', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.restoreAllMocks()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-compat-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when core is not installed anywhere', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })

    const result = await findCoreContract()
    expect(result).toBeNull()
  })

  it('finds contract via npm root -g strategy', async () => {
    const coreDir = path.join(tmpDir, 'specrails-core')
    fs.mkdirSync(coreDir, { recursive: true })
    const contractPath = path.join(coreDir, 'integration-contract.json')
    fs.writeFileSync(contractPath, '{}')
    vi.mocked(execSync).mockReturnValue(tmpDir as any)

    const result = await findCoreContract()
    expect(result).toBe(contractPath)
  })
})
