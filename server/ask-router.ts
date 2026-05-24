// Ask-the-Hub project-scoped router.
//
// Mounted under `/api/projects/:projectId/ask/*` by `project-router`. Honours
// the `SPECRAILS_ASK_HUB` env kill switch — when off, returns 404 for every
// path.

import { Router, type Request, type Response } from 'express'
import { Worker } from 'node:worker_threads'
import type { DbInstance } from './db'
import { isAskHubEnabled } from './feature-flags'
import { runFactualPipeline } from './ask/pipelines/factual'
import { runStatusPipeline } from './ask/pipelines/status'
import { runComparePipeline } from './ask/pipelines/compare'
import { runDecisionPipeline } from './ask/pipelines/decision'
import { classifyIntent } from './ask/intent-router'
import { searchInstant, searchHybridInstant } from './ask/search'
import { runBackfill } from './ask/backfill'
import { detectAvailableProviders, resolveAskProvider, type AskProviderSetting } from './ask/provider-detect'
import { generateAnswer } from './ask/answer'
import { getHubSetting } from './hub-db'
import { recordInvocation } from './ai-invocations'
import { insertQueryLog, listRecentQueries, clearQueryLog, rateQuery } from './ask/query-log'
import { countDocs, countByKind } from './ask/storage'
import { finaliseInvocationResult } from './result-event'
import type { NormalisedResult } from './providers/types'
import { getAdapter } from './providers/registry'
import { warmup } from './ask/embedder'
import crypto from 'node:crypto'

export interface AskRouterDeps {
  db: DbInstance
  hubDb: DbInstance
  projectId: string
  projectPath: string
  projectStateDir: string
  /** Provider id this project was registered with (`claude` or `codex`).
   *  Ask reuses this transparently so a Claude project asks Claude, a Codex
   *  project asks Codex — without the user having to configure anything. */
  projectProvider: string
  broadcast: (msg: Record<string, unknown>) => void
}

export function createAskRouter(deps: AskRouterDeps): ReturnType<typeof Router> {
  const router = Router()

  router.use((_req, res, next) => {
    if (!isAskHubEnabled()) {
      res.status(404).json({ error: 'ask_disabled' })
      return
    }
    next()
  })

  // GET /search — hybrid (BM25 + vector cosine + RRF) by default. Falls back
  // to BM25-only when `?fast=1` is passed (lower latency for very large
  // indexes). No LLM is invoked on either path.
  router.get('/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim()
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50)
    const fast = req.query.fast === '1' || req.query.fast === 'true'
    if (!q) {
      res.json({ results: [] })
      return
    }
    try {
      const results = fast
        ? searchInstant(deps.db, q, undefined, limit)
        : await searchHybridInstant(deps.db, deps.projectId, q, undefined, limit)
      // If hybrid returns nothing (cold cache / model unavailable), fall back
      // to plain BM25 so the user always sees *something* relevant.
      const finalResults = results.length > 0 ? results : searchInstant(deps.db, q, undefined, limit)
      res.json({ results: finalResults })
    } catch {
      res.json({ results: searchInstant(deps.db, q, undefined, limit) })
    }
  })

  // GET /index/status
  router.get('/index/status', (_req, res) => {
    const total = countDocs(deps.db)
    const byKind = countByKind(deps.db)
    res.json({ total, byKind })
  })

  // POST /index/rebuild — wipes ask_docs then runs a fresh backfill
  router.post('/index/rebuild', async (_req, res) => {
    try {
      deps.db.exec('DELETE FROM ask_docs')
      // start backfill async; respond immediately
      res.json({ status: 'started' })
      void runBackfill(
        { db: deps.db, projectPath: deps.projectPath, projectStateDir: deps.projectStateDir },
        deps.projectId,
        deps.broadcast,
      ).catch((err) => {
        deps.broadcast({ type: 'ask.degraded', reason: err instanceof Error ? err.message : String(err) })
      })
    } catch (err) {
      res.status(500).json({ error: 'rebuild_failed', message: err instanceof Error ? err.message : String(err) })
    }
  })

  // GET /history
  router.get('/history', (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100)
    res.json({ items: listRecentQueries(deps.db, limit) })
  })

  router.delete('/history', (_req, res) => {
    clearQueryLog(deps.db)
    res.json({ ok: true })
  })

  // POST /history/:id/rating  body: { rated: 1|-1, comment?: string }
  router.post('/history/:id/rating', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'invalid_id' }); return }
    const rated = req.body?.rated
    if (rated !== 1 && rated !== -1) { res.status(400).json({ error: 'invalid_rated' }); return }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : undefined
    rateQuery(deps.db, id, rated, comment)
    res.json({ ok: true })
  })

  // GET /providers — detection + resolution. The project's own provider
  // takes precedence (transparent UX): a claude-project asks claude, a
  // codex-project asks codex. Hub setting only kicks in as a manual override
  // ('none' to disable AI answers, or a forced provider).
  router.get('/providers', async (_req, res) => {
    const detected = await detectAvailableProviders()
    const hubSetting = (getHubSetting(deps.hubDb, 'ask_answer_provider') ?? null) as AskProviderSetting
    const effectiveSetting: AskProviderSetting =
      hubSetting === 'none'
        ? 'none'
        : (deps.projectProvider as AskProviderSetting) ?? hubSetting
    const resolution = resolveAskProvider(effectiveSetting, detected)
    res.json({ detected, setting: effectiveSetting, hubSetting, projectProvider: deps.projectProvider, resolution })
  })

  // POST /query — SSE answer endpoint
  router.post('/query', async (req: Request, res: Response) => {
    const question = String(req.body?.question ?? '').trim()
    if (!question) { res.status(400).json({ error: 'question_required' }); return }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const start = Date.now()
    const intent = classifyIntent(question)

    // Build pipeline
    const pipeline = intent === 'status'
      ? runStatusPipeline({ db: deps.db, projectId: deps.projectId, projectPath: deps.projectPath, question })
      : intent === 'compare'
        ? runComparePipeline(deps.db, deps.projectId, question)
        : intent === 'decision'
          ? await runDecisionPipeline(deps.db, deps.projectId, question)
          : await runFactualPipeline(deps.db, deps.projectId, question)

    send('sources', { intent, sources: pipeline.sources.map((s, i) => ({ n: i + 1, kind: s.kind, source_id: s.source_id, title: s.title, ticket_id: s.ticket_id, job_id: s.job_id, conversation_id: s.conversation_id, file_path: s.file_path })) })

    // Resolve provider. Project provider has precedence; hub setting only
    // forces 'none' (search-only) or overrides which provider is used.
    const detected = await detectAvailableProviders()
    const hubSetting = (getHubSetting(deps.hubDb, 'ask_answer_provider') ?? null) as AskProviderSetting
    const effectiveSetting: AskProviderSetting =
      hubSetting === 'none'
        ? 'none'
        : (deps.projectProvider as AskProviderSetting) ?? hubSetting
    const resolution = resolveAskProvider(effectiveSetting, detected)
    if (resolution.mode !== 'use') {
      send('done', { reason: 'no_provider', resolution })
      res.end()
      // log
      insertQueryLog(deps.db, {
        query: question, scope: null, intent, model: null, provider: null,
        sources_count: pipeline.sources.length, cost_usd: null, latency_ms: Date.now() - start, status: 'search-only', ts: Date.now(),
      })
      return
    }

    const providerId = resolution.provider
    const modelKey = providerId === 'claude' ? 'ask_answer_model_claude' : 'ask_answer_model_codex'
    const model = getHubSetting(deps.hubDb, modelKey) ?? (providerId === 'claude' ? 'claude-haiku-4-5' : 'gpt-4o-mini')

    // Budget cap
    const budgetRaw = getHubSetting(deps.hubDb, 'ask_monthly_budget_usd')
    const cap = Number.isFinite(Number(budgetRaw)) ? Number(budgetRaw) : 5
    const sinceMonth = new Date()
    sinceMonth.setDate(1)
    sinceMonth.setHours(0, 0, 0, 0)
    const spent = (deps.db
      .prepare(`SELECT COALESCE(SUM(total_cost_usd), 0) AS s FROM ai_invocations WHERE surface = 'ask' AND started_at >= ?`)
      .get(sinceMonth.toISOString()) as { s: number }).s
    if (spent >= cap) {
      send('error', { reason: 'budget', cap, spent })
      send('done', {})
      res.end()
      return
    }

    const ac = new AbortController()
    req.on('close', () => ac.abort())

    const invocationId = crypto.randomUUID()
    const invocationStart = new Date()

    // Heartbeat so the client can render a "thinking" indicator while the
    // model streams its raw JSON envelope (which we parse server-side and
    // only emit cleanly via the `answer` event below).
    send('thinking', {})

    // Optional conversational history sent by the client. Each entry is a
    // { question, answer } pair from the same modal session. Trimmed in
    // `buildUserPrompt`; we accept up to 5 here as a hard cap.
    const rawTurns = Array.isArray(req.body?.previousTurns) ? req.body.previousTurns : []
    const previousTurns = rawTurns
      .slice(-5)
      .filter((t: unknown): t is { question: string; answer: string } =>
        typeof t === 'object' && t !== null
          && typeof (t as { question?: unknown }).question === 'string'
          && typeof (t as { answer?: unknown }).answer === 'string')

    const outcome = await generateAnswer({
      providerId,
      model,
      pipelineContext: pipeline,
      cwd: deps.projectPath,
      previousTurns,
      onResult: (payload) => {
        const adapter = getAdapter(providerId)
        const { result: norm } = finaliseInvocationResult(adapter, [{ kind: 'result', payload }], { fallbackModel: model })
        send('invocation', { model: norm.model ?? model, cost: norm.total_cost_usd, turns: norm.num_turns, durationMs: norm.duration_ms })
      },
      abortSignal: ac.signal,
    })

    if (outcome.envelope) {
      // Emit the parsed answer text in chunks so the client still gets a
      // streaming feel without seeing the raw JSON envelope.
      const text = outcome.envelope.answer
      const CHUNK = 32
      for (let i = 0; i < text.length; i += CHUNK) {
        send('token', { text: text.slice(i, i + CHUNK) })
      }
      send('citation', { citations: outcome.envelope.citations })
      send('followups', { items: outcome.envelope.followups })
    } else if (outcome.rawText) {
      // Envelope failed to parse — surface the raw text so the user gets
      // *something*, but mark it as degraded.
      send('token', { text: outcome.rawText })
      send('degraded', { reason: 'envelope_parse_failed' })
    } else {
      // Provider crashed / timed out / produced no text. Always emit a
      // visible failure so the client doesn't get stuck on "Thinking…".
      const stderr = outcome.stderr ?? ''
      // Pattern-match common upstream failures so the surfaced message is
      // actionable instead of just "provider_exit_1".
      const upstreamMatch = stderr.match(/HTTP error:\s*(\d{3})/)
      const upstreamCode = upstreamMatch ? upstreamMatch[1] : null
      const reason = outcome.status === 'aborted' ? 'aborted'
        : upstreamCode ? `upstream_${upstreamCode}`
        : outcome.exitCode !== 0 ? `provider_exit_${outcome.exitCode}`
        : 'empty_response'
      const stderrTail = stderr.split('\n').filter(Boolean).slice(-5).join('\n')
      const stdoutTail = outcome.rawText?.split('\n').filter(Boolean).slice(-5).join('\n') ?? ''
      console.warn(
        `[ask] provider failed: ${reason}\n  exitCode=${outcome.exitCode}\n  stderr (last 5 lines):\n${stderr || '(empty)'}\n  stdout (last 5 lines):\n${outcome.rawText || '(empty)'}`,
      )
      send('error', { reason, stderr: stderrTail, stdout: stdoutTail })
      const parts: string[] = [`**${reason}**`]
      if (upstreamCode === '503' || upstreamCode === '502' || upstreamCode === '504') {
        parts.push('\n\nThe upstream model service is unavailable. This is usually transient — wait a minute and try again.')
      } else if (upstreamCode === '401' || upstreamCode === '403') {
        parts.push('\n\nAuthentication rejected by the upstream model service. Run the provider CLI directly in a terminal to re-authenticate.')
      } else if (upstreamCode === '429') {
        parts.push('\n\nRate limited by the upstream model service. Wait a minute and try again.')
      }
      if (stderrTail) parts.push(`\n_stderr:_\n\n\`\`\`\n${stderrTail}\n\`\`\``)
      if (stdoutTail) parts.push(`\n_stdout:_\n\n\`\`\`\n${stdoutTail}\n\`\`\``)
      if (!stderrTail && !stdoutTail) parts.push('\n\nThe provider CLI exited silently. Check that `claude` (or `codex`) is on PATH and authenticated. Run `claude` once in a terminal to confirm.')
      send('token', { text: parts.join('\n') })
    }
    send('done', { status: outcome.status })
    res.end()

    // Persist invocation row + query log
    try {
      const adapter = getAdapter(providerId)
      const norm: NormalisedResult = outcome.resultPayload
        ? finaliseInvocationResult(adapter, [{ kind: 'result', payload: outcome.resultPayload }], { fallbackModel: model }).result
        : ({} as NormalisedResult)
      recordInvocation(deps.db, {
        id: invocationId,
        project_id: deps.projectId,
        provider: providerId,
        surface: 'ask',
        surface_ref_id: null,
        ticket_id: null,
        conversation_id: null,
        status: outcome.status === 'success' ? 'success' : outcome.status === 'aborted' ? 'aborted' : 'failed',
        started_at: invocationStart.toISOString(),
        finished_at: new Date().toISOString(),
        model: norm.model ?? model,
        tokens_in: norm.tokens_in,
        tokens_out: norm.tokens_out,
        tokens_cache_read: norm.tokens_cache_read,
        tokens_cache_create: norm.tokens_cache_create,
        total_cost_usd: norm.total_cost_usd,
        num_turns: norm.num_turns,
        duration_ms: norm.duration_ms,
        duration_api_ms: norm.duration_api_ms,
        session_id: norm.session_id,
      })
      insertQueryLog(deps.db, {
        query: question, scope: null, intent, model, provider: providerId,
        sources_count: pipeline.sources.length, cost_usd: norm.total_cost_usd ?? null, latency_ms: Date.now() - start,
        status: outcome.status, ts: Date.now(),
      })
    } catch {
      // analytics best-effort
    }
  })

  return router
}

// Re-export Worker for build-time linkage with the embedder worker.
export { Worker, warmup }
