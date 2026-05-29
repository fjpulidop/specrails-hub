// Enumerates indexable docs for a project. Reads from existing per-project
// data sources (ticket-store JSON, chat_messages SQL, jobs SQL, file-summaries
// directory, git log) and produces AskDocs ready for upsert.

import path from 'node:path'
import fs from 'node:fs'
import type { DbInstance } from '../db'
import { readStore, resolveTicketStoragePath } from '../ticket-store'
import {
  chunkTicket,
  chunkExploreTurn,
  chunkJob,
  chunkFileSummary,
  chunkGitCommit,
} from './chunker'
import type { AskDoc } from './types'

export interface EnumerationContext {
  db: DbInstance
  projectPath: string
  /** Slug-keyed dir under `~/.specrails/projects/<slug>/`. */
  projectStateDir: string
}

export function enumerateTickets(ctx: EnumerationContext): AskDoc[] {
  try {
    const store = readStore(resolveTicketStoragePath(ctx.projectPath))
    const docs: AskDoc[] = []
    for (const t of Object.values(store.tickets)) {
      docs.push(
        chunkTicket({
          id: t.id,
          title: t.title,
          description: t.description,
          labels: t.labels,
          status: t.status,
          updated_at: t.updated_at,
        }),
      )
    }
    return docs
  } catch {
    return []
  }
}

interface ChatMessageRow {
  id: number
  conversation_id: string
  role: string
  content: string
  created_at: string
}

export function enumerateExploreTurns(ctx: EnumerationContext): AskDoc[] {
  try {
    // Conversations with kind='explore'. The explore-kind column lives on
    // chat_conversations after migration 17.
    const convs = ctx.db
      .prepare("SELECT id FROM chat_conversations WHERE kind = 'explore'")
      .all() as Array<{ id: string }>
    const docs: AskDoc[] = []
    for (const conv of convs) {
      const msgs = ctx.db
        .prepare(
          `SELECT id, conversation_id, role, content, created_at
           FROM chat_messages
           WHERE conversation_id = ?
           ORDER BY id ASC`,
        )
        .all(conv.id) as ChatMessageRow[]
      let pendingUser: ChatMessageRow | null = null
      for (const m of msgs) {
        if (m.role === 'user') {
          pendingUser = m
        } else if (m.role === 'assistant' && pendingUser) {
          const d = chunkExploreTurn({
            conversation_id: m.conversation_id,
            turn_index: pendingUser.id,
            user_text: pendingUser.content,
            assistant_text: m.content,
            ts: m.created_at,
          })
          if (d) docs.push(d)
          pendingUser = null
        }
      }
    }
    return docs
  } catch {
    return []
  }
}

export function enumerateJobs(ctx: EnumerationContext): AskDoc[] {
  try {
    const rows = ctx.db
      .prepare(
        `SELECT id, command, status, finished_at FROM jobs
         WHERE finished_at IS NOT NULL
         ORDER BY finished_at DESC
         LIMIT 1000`,
      )
      .all() as Array<{ id: string; command: string; status: string; finished_at: string }>
    return rows.map((r) =>
      chunkJob({
        id: r.id,
        command: r.command,
        status: r.status,
        finished_at: r.finished_at,
      }),
    )
  } catch {
    return []
  }
}

export function enumerateFileSummaries(ctx: EnumerationContext): AskDoc[] {
  const dir = path.join(ctx.projectPath, '.specrails', 'file-summaries')
  if (!fs.existsSync(dir)) return []
  const out: AskDoc[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const full = path.join(dir, name)
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as {
        file_path?: string
        summary?: string
        updated_at?: string
      }
      if (parsed.file_path && parsed.summary) {
        out.push(
          chunkFileSummary({
            file_path: parsed.file_path,
            summary: parsed.summary,
            updated_at: parsed.updated_at,
          }),
        )
      }
    } catch {
      // skip corrupt file
    }
  }
  return out
}

export async function enumerateGitCommits(ctx: EnumerationContext, limit = 1000): Promise<AskDoc[]> {
  if (!fs.existsSync(path.join(ctx.projectPath, '.git'))) return []
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execFile } = await import('node:child_process')
    return await new Promise<AskDoc[]>((resolve) => {
      execFile(
        'git',
        ['log', '--since=6.months', `-n`, String(limit), '--pretty=format:%H%x00%s%x00%an%x00%aI%x00%b%x1f'],
        { cwd: ctx.projectPath, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve([])
            return
          }
          const out: AskDoc[] = []
          for (const entry of stdout.split('\x1f')) {
            const e = entry.trim()
            if (!e) continue
            const [sha, subject, author, date, body] = e.split('\x00')
            if (!sha || !subject) continue
            out.push(chunkGitCommit({ sha, subject, author, date, body: body ?? '' }))
          }
          resolve(out)
        },
      )
    })
  } catch {
    return []
  }
}

export async function enumerateAll(ctx: EnumerationContext): Promise<AskDoc[]> {
  const [t, e, j, f, g] = await Promise.all([
    Promise.resolve(enumerateTickets(ctx)),
    Promise.resolve(enumerateExploreTurns(ctx)),
    Promise.resolve(enumerateJobs(ctx)),
    Promise.resolve(enumerateFileSummaries(ctx)),
    enumerateGitCommits(ctx),
  ])
  return [...t, ...e, ...j, ...f, ...g]
}
