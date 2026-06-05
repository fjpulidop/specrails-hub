import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import type { Plugin, WsMessage } from './types'
import { PluginManager } from './plugin-manager'

let tmpDir: string
let captured: WsMessage[]
const broadcast = (m: WsMessage) => { captured.push(m) }

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-probe-'))
  captured = []
})
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe('race probe: A rolls back, B already merged', () => {
  it('does B survive A rollback?', async () => {
    const aMerged = deferred()
    const bMerged = deferred()
    const aVerifyGate = deferred()

    // Plugin A: merges its key, then verify FAILS (after B merges).
    const a: Plugin = {
      manifest: { name: 'a', version: '1', description: '', whatItDoes: [], owns: { mcpServers: ['a'] } },
      install: async (ctx) => {
        await PluginManager.mergeMcpServers(ctx.projectPath, { a: { command: 'a' } })
        aMerged.resolve()
        // wait until B has merged before letting A's verify proceed
        await bMerged.promise
      },
      uninstall: async (ctx) => { await PluginManager.removeMcpServers(ctx.projectPath, ['a']) },
      verify: async () => {
        await aVerifyGate.promise
        return { ok: false, reason: 'forced-fail', checkedAt: new Date().toISOString() }
      },
    }

    // Plugin B: merges its key after A merged, succeeds.
    const b: Plugin = {
      manifest: { name: 'b', version: '1', description: '', whatItDoes: [], owns: { mcpServers: ['b'] } },
      install: async (ctx) => {
        await aMerged.promise           // ensure A snapshot was taken with no 'a' yet; A merges first
        await PluginManager.mergeMcpServers(ctx.projectPath, { b: { command: 'b' } })
        bMerged.resolve()
      },
      uninstall: async (ctx) => { await PluginManager.removeMcpServers(ctx.projectPath, ['b']) },
      verify: async () => ({ ok: true, checkedAt: new Date().toISOString() }),
    }

    const m = new PluginManager([a, b])

    // Release A's verify gate once B has committed everything.
    bMerged.promise.then(() => {
      // give B time to fully commit state + finish, then let A roll back
      setTimeout(() => aVerifyGate.resolve(), 50)
    })

    const results = await Promise.allSettled([
      m.install(tmpDir, 'pid', 'a', broadcast),
      m.install(tmpDir, 'pid', 'b', broadcast),
    ])

    const aRes = results[0]
    const bRes = results[1]
    console.log('A install result =', aRes.status, aRes.status === 'rejected' ? (aRes as any).reason?.message : '')
    console.log('B install result =', bRes.status, bRes.status === 'rejected' ? (bRes as any).reason?.message : '')

    const mcpPath = path.join(tmpDir, '.mcp.json')
    const statePath = path.join(tmpDir, '.specrails', 'plugins', 'state.json')
    const mcpExists = fs.existsSync(mcpPath)
    const stateExists = fs.existsSync(statePath)
    console.log('.mcp.json exists after run =', mcpExists)
    console.log('state.json exists after run =', stateExists)
    const mcp = mcpExists ? JSON.parse(fs.readFileSync(mcpPath, 'utf8')) : { mcpServers: {} }
    const state = stateExists ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { plugins: {} }

    console.log('FINAL .mcp.json mcpServers =', JSON.stringify(mcp.mcpServers))
    console.log('FINAL state.plugins keys =', JSON.stringify(Object.keys(state.plugins)))

    // The claim: B's key gets clobbered by A's rollback while state says installed.
    const bInState = !!state.plugins.b
    const bInMcp = !!mcp.mcpServers?.b
    console.log('CLAIM CHECK: B in state =', bInState, ', B in .mcp.json =', bInMcp)
    if (bInState && !bInMcp) {
      console.log('>>> DEFECT REPRODUCED: state says B installed but .mcp.json missing serena/b key <<<')
    } else {
      console.log('>>> DEFECT NOT reproduced in this interleaving <<<')
    }
  })
})
