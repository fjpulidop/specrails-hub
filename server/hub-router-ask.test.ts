// Focused tests for the Ask-the-Hub settings endpoints in hub-router.
// Mirrors the lightweight mock setup used elsewhere in this repo to drive
// the router without spinning a full ProjectRegistry.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('./core-compat', async (importActual) => {
  const actual = await importActual<typeof import('./core-compat')>()
  return {
    ...actual,
    checkCoreCompat: vi.fn().mockResolvedValue({ compatible: true, contractFound: false }),
    getCLIStatus: vi.fn().mockReturnValue({ provider: 'claude', version: '1.2.3' }),
    detectAvailableCLIs: vi.fn().mockReturnValue({ claude: true, codex: false }),
  }
})

vi.mock('./specrails-tech-client', () => ({
  createSpecrailsTechClient: vi.fn(() => ({
    health: vi.fn(),
    listAgents: vi.fn(),
    getAgent: vi.fn(),
    listDocs: vi.fn(),
    getDoc: vi.fn(),
  })),
}))

import { createHubRouter } from './hub-router'
import { initHubDb } from './hub-db'
import type { ProjectRegistry } from './project-registry'
import type { DbInstance } from './db'

function mkRegistry(hubDb: DbInstance) {
  return {
    hubDb,
    getContext: vi.fn(),
    getContextByPath: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => []),
  } as unknown as ProjectRegistry
}

function build(hubDb: DbInstance) {
  const app = express()
  app.use(express.json())
  const router = createHubRouter(mkRegistry(hubDb), () => {})
  app.use('/api/hub', router)
  return app
}

describe('hub-router /ask-settings', () => {
  let hubDb: DbInstance
  beforeEach(() => { hubDb = initHubDb(':memory:') })

  it('returns defaults when no settings have been written', async () => {
    const res = await request(build(hubDb)).get('/api/hub/ask-settings')
    expect(res.status).toBe(200)
    expect(res.body.provider).toBeNull()
    expect(res.body.answerModel).toEqual({ claude: 'claude-haiku-4-5', codex: 'gpt-4o-mini' })
    expect(res.body.reranker).toBe('heuristic')
    expect(res.body.autoIndexOnFirstOpen).toBe(true)
    expect(res.body.hotkey).toBeNull()
    expect(res.body.monthlyBudgetUsd).toBe(5.0)
  })

  it('PATCH round-trips every field', async () => {
    const app = build(hubDb)
    const res = await request(app)
      .patch('/api/hub/ask-settings')
      .send({
        provider: 'claude',
        reranker: 'llm',
        answerModelClaude: 'claude-opus-4-7',
        answerModelCodex: 'o1-mini',
        autoIndexOnFirstOpen: false,
        hotkey: 'Cmd+Shift+K',
        monthlyBudgetUsd: 10,
      })
    expect(res.status).toBe(200)
    expect(res.body.provider).toBe('claude')
    expect(res.body.reranker).toBe('llm')
    expect(res.body.answerModel.claude).toBe('claude-opus-4-7')
    expect(res.body.answerModel.codex).toBe('o1-mini')
    expect(res.body.autoIndexOnFirstOpen).toBe(false)
    expect(res.body.hotkey).toBe('Cmd+Shift+K')
    expect(res.body.monthlyBudgetUsd).toBe(10)
  })

  it.each([
    ['provider', 'banana', 'invalid_provider'],
    ['reranker', 'banana', 'invalid_reranker'],
    ['hotkey', 123, 'invalid_hotkey'],
    ['autoIndexOnFirstOpen', 'yes', 'invalid_auto_index'],
    ['monthlyBudgetUsd', -1, 'invalid_monthly_budget_usd'],
    ['answerModelClaude', 5, 'invalid_answer_model_claude'],
    ['answerModelCodex', 5, 'invalid_answer_model_codex'],
  ])('rejects invalid %s', async (key, value, error) => {
    const res = await request(build(hubDb)).patch('/api/hub/ask-settings').send({ [key]: value })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('clears provider when set to null', async () => {
    const app = build(hubDb)
    await request(app).patch('/api/hub/ask-settings').send({ provider: 'codex' })
    const res = await request(app).patch('/api/hub/ask-settings').send({ provider: null })
    expect(res.status).toBe(200)
    expect(res.body.provider).toBeNull()
  })

  it('clears hotkey when set to empty string', async () => {
    const app = build(hubDb)
    await request(app).patch('/api/hub/ask-settings').send({ hotkey: 'Cmd+K' })
    const res = await request(app).patch('/api/hub/ask-settings').send({ hotkey: '' })
    expect(res.status).toBe(200)
    expect(res.body.hotkey).toBeNull()
  })
})
