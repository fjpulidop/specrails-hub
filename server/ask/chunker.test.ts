import { describe, it, expect } from 'vitest'
import { chunkTicket, chunkExploreTurn, chunkJob, chunkFileSummary, chunkGitCommit } from './chunker'

describe('chunker', () => {
  it('chunks a ticket and stamps body_hash deterministically', () => {
    const d = chunkTicket({ id: 42, title: 'Add OAuth', description: 'Use passport', labels: ['auth'], status: 'done', updated_at: '2026-05-10T00:00:00Z' })
    expect(d.kind).toBe('ticket')
    expect(d.source_id).toBe('ticket:42')
    expect(d.ticket_id).toBe('42')
    expect(d.body).toContain('passport')
    expect(d.body_hash).toHaveLength(64) // sha256 hex
    // Same inputs → same hash
    const d2 = chunkTicket({ id: 42, title: 'Add OAuth', description: 'Use passport', labels: ['auth'], status: 'done', updated_at: '2026-05-10T00:00:00Z' })
    expect(d.body_hash).toBe(d2.body_hash)
  })

  it('skips explore turns shorter than 20 chars', () => {
    expect(chunkExploreTurn({ conversation_id: 'c1', turn_index: 1, user_text: 'hi', assistant_text: 'hello' })).toBeNull()
  })

  it('chunks explore turn pair with both user and assistant content', () => {
    const d = chunkExploreTurn({ conversation_id: 'c1', turn_index: 3, user_text: 'why did we choose passport-google-oauth20?', assistant_text: 'Because it integrated with the existing JWT middleware.', ts: '2026-05-01T00:00:00Z' })
    expect(d).not.toBeNull()
    expect(d!.conversation_id).toBe('c1')
    expect(d!.source_id).toBe('explore:c1:3')
    expect(d!.body).toMatch(/User:.*passport/s)
    expect(d!.body).toMatch(/Assistant:.*JWT/s)
  })

  it('chunks a job with command + status', () => {
    const d = chunkJob({ id: 'job-1', command: '/specrails:implement', status: 'completed', finished_at: '2026-05-01T00:00:00Z' })
    expect(d.kind).toBe('job')
    expect(d.job_id).toBe('job-1')
    expect(d.body).toContain('Command')
    expect(d.body).toContain('Status: completed')
  })

  it('chunks a file summary keyed by file path', () => {
    const d = chunkFileSummary({ file_path: 'server/db.ts', summary: 'Sqlite migrations', updated_at: 0 })
    expect(d.source_id).toBe('file-summary:server/db.ts')
    expect(d.file_path).toBe('server/db.ts')
  })

  it('chunks a git commit', () => {
    const d = chunkGitCommit({ sha: 'abc1234', subject: 'feat: add oauth', author: 'me', date: '2026-05-01T00:00:00Z' })
    expect(d.source_id).toBe('git:abc1234')
    expect(d.title).toBe('feat: add oauth')
  })
})
