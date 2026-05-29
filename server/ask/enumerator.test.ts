import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { enumerateExploreTurns, enumerateJobs, enumerateFileSummaries, enumerateGitCommits, enumerateTickets } from './enumerator'

describe('enumerator', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('enumerateTickets returns [] when ticket store is missing', () => {
    expect(enumerateTickets({ db, projectPath: '/tmp/missing-' + Date.now(), projectStateDir: '/tmp' })).toEqual([])
  })

  it('enumerateExploreTurns walks chat_conversations + chat_messages', () => {
    db.exec(`
      INSERT INTO chat_conversations (id, title, created_at, updated_at, kind)
      VALUES ('conv-1', 't', datetime('now'), datetime('now'), 'explore');
      INSERT INTO chat_messages (conversation_id, role, content) VALUES ('conv-1', 'user', 'why did we add oauth feature?');
      INSERT INTO chat_messages (conversation_id, role, content) VALUES ('conv-1', 'assistant', 'Because acme wanted it.');
    `)
    const docs = enumerateExploreTurns({ db, projectPath: '/tmp', projectStateDir: '/tmp' })
    expect(docs.length).toBe(1)
    expect(docs[0]!.kind).toBe('explore-turn')
  })

  it('enumerateExploreTurns skips non-explore conversations', () => {
    db.exec(`
      INSERT INTO chat_conversations (id, title, created_at, updated_at, kind)
      VALUES ('side-1', 't', datetime('now'), datetime('now'), 'sidebar');
      INSERT INTO chat_messages (conversation_id, role, content) VALUES ('side-1', 'user', 'long enough question text');
      INSERT INTO chat_messages (conversation_id, role, content) VALUES ('side-1', 'assistant', 'reply');
    `)
    expect(enumerateExploreTurns({ db, projectPath: '/tmp', projectStateDir: '/tmp' })).toEqual([])
  })

  it('enumerateJobs returns finished jobs', () => {
    db.exec(`
      INSERT INTO jobs (id, command, started_at, status, finished_at) VALUES ('j1', '/specrails:implement', datetime('now'), 'completed', datetime('now'));
      INSERT INTO jobs (id, command, started_at, status) VALUES ('j2', '/specrails:implement', datetime('now'), 'running');
    `)
    const docs = enumerateJobs({ db, projectPath: '/tmp', projectStateDir: '/tmp' })
    expect(docs.map((d) => d.source_id)).toEqual(['job:j1'])
  })

  it('enumerateFileSummaries returns [] when dir missing', () => {
    expect(enumerateFileSummaries({ db, projectPath: '/tmp/no-such-' + Date.now(), projectStateDir: '/tmp' })).toEqual([])
  })

  it('enumerateGitCommits returns [] outside a git repo', async () => {
    expect(await enumerateGitCommits({ db, projectPath: '/tmp/not-a-repo-' + Date.now(), projectStateDir: '/tmp' })).toEqual([])
  })
})
