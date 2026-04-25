import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'
import type { DbInstance } from './db'
import {
  getProposal,
  updateProposal,
} from './db'
import { resolveCommand } from './command-resolver'

// ─── ProposalManager ──────────────────────────────────────────────────────────

export class ProposalManager {
  private _broadcast: (msg: WsMessage) => void
  private _db: DbInstance
  private _cwd: string
  private _activeProcesses: Map<string, ChildProcess>
  private _buffers: Map<string, string>

  constructor(broadcast: (msg: WsMessage) => void, db: DbInstance, cwd: string) {
    this._broadcast = broadcast
    this._db = db
    this._cwd = cwd
    this._activeProcesses = new Map()
    this._buffers = new Map()
  }

  isActive(proposalId: string): boolean {
    return this._activeProcesses.has(proposalId)
  }

  async startExploration(proposalId: string, idea: string): Promise<void> {
    const proposal = getProposal(this._db, proposalId)
    if (!proposal) {
      this._broadcastError(proposalId, 'Proposal not found')
      return
    }

    // Resolve the command file — error if not installed
    const rawCommand = `/specrails:propose-feature ${idea}`
    const prompt = resolveCommand(rawCommand, this._cwd)
    if (prompt === rawCommand) {
      updateProposal(this._db, proposalId, { status: 'cancelled' })
      this._broadcastError(proposalId, 'This project does not have the /specrails:propose-feature command installed. Run "npx specrails-core@latest" to update.')
      return
    }

    updateProposal(this._db, proposalId, { status: 'exploring' })

    const args = [
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
      '-p', prompt,
    ]

    await this._runProcess(proposalId, args, (fullText, sessionId) => {
      updateProposal(this._db, proposalId, {
        status: 'review',
        result_markdown: fullText,
        ...(sessionId ? { session_id: sessionId } : {}),
      })
      this._broadcast({
        type: 'proposal_ready',
        projectId: '',
        proposalId,
        markdown: fullText,
        timestamp: new Date().toISOString(),
      })
    }, () => {
      updateProposal(this._db, proposalId, { status: 'input' })
      this._broadcastError(proposalId, 'Exploration failed')
    })
  }

  async sendRefinement(proposalId: string, feedback: string): Promise<void> {
    const proposal = getProposal(this._db, proposalId)
    if (!proposal) {
      this._broadcastError(proposalId, 'Proposal not found')
      return
    }

    if (!proposal.session_id) {
      this._broadcastError(proposalId, 'No session available for refinement')
      return
    }

    updateProposal(this._db, proposalId, { status: 'refining' })

    const args = [
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
      '--resume', proposal.session_id,
      '-p', feedback,
    ]

    await this._runProcess(proposalId, args, (fullText, sessionId) => {
      updateProposal(this._db, proposalId, {
        status: 'review',
        result_markdown: fullText,
        ...(sessionId ? { session_id: sessionId } : {}),
      })
      this._broadcast({
        type: 'proposal_refined',
        projectId: '',
        proposalId,
        markdown: fullText,
        timestamp: new Date().toISOString(),
      })
    }, () => {
      updateProposal(this._db, proposalId, { status: 'review' })
      this._broadcastError(proposalId, 'Refinement failed')
    })
  }

  async createIssue(proposalId: string): Promise<void> {
    const proposal = getProposal(this._db, proposalId)
    if (!proposal) {
      this._broadcastError(proposalId, 'Proposal not found')
      return
    }

    if (!proposal.session_id) {
      this._broadcastError(proposalId, 'No session available for issue creation')
      return
    }

    updateProposal(this._db, proposalId, { status: 'refining' })

    const prompt =
      "Based on the proposal above, create a GitHub Issue with the label 'user-proposed'. " +
      "Output only the URL of the created issue on the last line of your response."

    const args = [
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
      '--resume', proposal.session_id,
      '-p', prompt,
    ]

    await this._runProcess(proposalId, args, (fullText, sessionId) => {
      const match = fullText.match(/https:\/\/github\.com\/[^\s]+\/issues\/\d+/)
      const issueUrl = match ? match[0] : null

      if (issueUrl) {
        updateProposal(this._db, proposalId, {
          status: 'created',
          issue_url: issueUrl,
          ...(sessionId ? { session_id: sessionId } : {}),
        })
        this._broadcast({
          type: 'proposal_issue_created',
          projectId: '',
          proposalId,
          issueUrl,
          timestamp: new Date().toISOString(),
        })
      } else {
        updateProposal(this._db, proposalId, { status: 'review' })
        this._broadcastError(
          proposalId,
          'Issue creation failed — GitHub CLI may not be available or not authenticated'
        )
      }
    }, () => {
      updateProposal(this._db, proposalId, { status: 'review' })
      this._broadcastError(proposalId, 'Issue creation failed')
    })
  }

  cancel(proposalId: string): void {
    const child = this._activeProcesses.get(proposalId)
    if (child?.pid) {
      treeKill(child.pid, 'SIGTERM')
    }
    updateProposal(this._db, proposalId, { status: 'cancelled' })
    this._broadcast({
      type: 'proposal_error',
      projectId: '',
      proposalId,
      error: 'cancelled',
      timestamp: new Date().toISOString(),
    })
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _runProcess(
    proposalId: string,
    args: string[],
    onSuccess: (fullText: string, sessionId: string | null) => void,
    onError: () => void
  ): Promise<void> {
    // Windows claude is a .cmd shim; shell:true needed to resolve via PATH.
    const child = spawn('claude', args, {
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._cwd,
    })

    this._activeProcesses.set(proposalId, child)
    this._buffers.set(proposalId, '')

    let capturedSessionId: string | null = null

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

    stdoutReader.on('line', (line) => {
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(line) } catch { /* skip non-JSON */ }
      if (!parsed) return

      const eventType = parsed.type as string

      if (eventType === 'result') {
        const sid = parsed.session_id as string | undefined
        if (sid) capturedSessionId = sid
      }

      if (eventType === 'assistant') {
        const msg = parsed.message as { content?: Array<{ type: string; text?: string; name?: string }> } | undefined
        const blocks = msg?.content ?? []

        // Extract text from text blocks (skip thinking blocks)
        const texts = blocks
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
        const newText = texts.join('')
        if (newText) {
          const prev = this._buffers.get(proposalId) ?? ''
          this._buffers.set(proposalId, prev + newText)
          this._broadcast({
            type: 'proposal_stream',
            projectId: '',
            proposalId,
            delta: newText,
            timestamp: new Date().toISOString(),
          })
        }

        // Broadcast tool_use activity so the UI can show "reading codebase..."
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name) {
            this._broadcast({
              type: 'proposal_stream',
              projectId: '',
              proposalId,
              delta: `<!--tool:${block.name}-->`,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
    })

    return new Promise<void>((resolve) => {
      // Without this handler an ENOENT on spawn (e.g. `claude` not on
      // PATH) propagates as an unhandled 'error' event and crashes the
      // entire hub process. Surface to the user instead.
      child.on('error', (err) => {
        console.error(`[ProposalManager] spawn failed for ${proposalId}: ${err.message}`)
        this._activeProcesses.delete(proposalId)
        this._buffers.delete(proposalId)
        this._broadcastError(proposalId, `Failed to launch claude: ${err.message}`)
        onError()
        resolve()
      })
      child.on('close', (code) => {
        const fullText = this._buffers.get(proposalId) ?? ''
        this._activeProcesses.delete(proposalId)
        this._buffers.delete(proposalId)

        if (code === 0) {
          onSuccess(fullText, capturedSessionId)
        } else {
          onError()
        }

        resolve()
      })
    })
  }

  private _broadcastError(proposalId: string, error: string): void {
    this._broadcast({
      type: 'proposal_error',
      projectId: '',
      proposalId,
      error,
      timestamp: new Date().toISOString(),
    })
  }
}
