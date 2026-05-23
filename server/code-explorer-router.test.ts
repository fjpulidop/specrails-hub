import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, type DbInstance } from './db'
import { createCodeExplorerRouter } from './code-explorer-router'

let projectPath: string
let db: DbInstance
let app: express.Express
let enqueueSpy: ReturnType<typeof vi.fn>

function mountApp(): void {
  app = express()
  app.use(express.json())
  enqueueSpy = vi.fn(async () => 'enqueued' as const)
  const router = createCodeExplorerRouter({
    db,
    projectPath,
    projectId: 'proj-test',
    broadcast: vi.fn(),
    fileSummaryManager: { enqueue: enqueueSpy as never },
  })
  app.use('/api/projects/proj-test/code', router)
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'code-explorer-router-'))
  db = initDb(':memory:')
  delete process.env.SPECRAILS_CODE_EXPLORER
  mountApp()
})

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
  db.close()
  delete process.env.SPECRAILS_CODE_EXPLORER
})

describe('feature-flag gating', () => {
  it('returns 404 on every route when SPECRAILS_CODE_EXPLORER=false', async () => {
    process.env.SPECRAILS_CODE_EXPLORER = 'false'
    const routes = ['/tree', '/file?path=foo.ts', '/summary?path=foo.ts', '/provenance?ticketId=1', '/diff?jobId=j1&path=foo.ts']
    for (const r of routes) {
      const res = await request(app).get(`/api/projects/proj-test/code${r}`)
      expect(res.status).toBe(404)
    }
    const res = await request(app)
      .post('/api/projects/proj-test/code/file/regenerate-summary?path=foo.ts')
      .send({})
    expect(res.status).toBe(404)
  })
})

describe('GET /file', () => {
  it('returns content + language for a small text file', async () => {
    fs.writeFileSync(path.join(projectPath, 'hello.ts'), 'export const x = 1\n', 'utf8')
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('hello.ts', 12, 'job-a', 'modified', 1000)
    const res = await request(app).get('/api/projects/proj-test/code/file?path=hello.ts')
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('export const x = 1\n')
    expect(res.body.language).toBe('typescript')
    expect(res.body.encoding).toBe('utf-8')
    expect(res.body.summary).toBeNull()
    expect(res.body.summaryStale).toBe(false)
    expect(res.body.provenance).toEqual([
      { path: 'hello.ts', ticketId: 12, jobId: 'job-a', kind: 'modified', at: 1000 },
    ])
  })

  it('refuses path traversal with 400', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/file?path=../../etc/passwd')
    expect(res.status).toBe(400)
  })

  it('rejects absolute paths', async () => {
    const res = await request(app).get(
      `/api/projects/proj-test/code/file?path=${encodeURIComponent('/etc/passwd')}`,
    )
    expect(res.status).toBe(400)
  })

  it('returns binary:true for files with NUL bytes', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00])
    fs.writeFileSync(path.join(projectPath, 'blob.bin'), buf)
    const res = await request(app).get('/api/projects/proj-test/code/file?path=blob.bin')
    expect(res.status).toBe(200)
    expect(res.body.binary).toBe(true)
    expect(res.body.mime).toBe('application/octet-stream')
    expect(res.body.sizeBytes).toBe(5)
  })

  it('returns tooLarge:true for files over 2 MB', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 0x41)
    fs.writeFileSync(path.join(projectPath, 'big.txt'), big)
    const res = await request(app).get('/api/projects/proj-test/code/file?path=big.txt')
    expect(res.status).toBe(200)
    expect(res.body.tooLarge).toBe(true)
    expect(res.body.sizeBytes).toBeGreaterThan(2 * 1024 * 1024)
  })

  it('returns 404 when file does not exist and no summary stored', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/file?path=missing.ts')
    expect(res.status).toBe(404)
  })
})

describe('GET /tree pagination', () => {
  it('returns entries up to 2000 and produces a stable cursor', async () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(path.join(projectPath, `f${i.toString().padStart(2, '0')}.txt`), 'x')
    }
    const res = await request(app).get('/api/projects/proj-test/code/code/tree?filter=all').catch(() => null)
    void res
    const r = await request(app).get('/api/projects/proj-test/code/tree?filter=all')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.entries)).toBe(true)
    expect(r.body.entries.length).toBe(25)
    expect(r.body.nextCursor).toBeNull()
  })

  it('respects the deny-list (node_modules, dotfiles)', async () => {
    fs.mkdirSync(path.join(projectPath, 'node_modules', 'foo'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'node_modules', 'foo', 'index.js'), 'x')
    fs.writeFileSync(path.join(projectPath, '.env'), 'SECRET=1')
    fs.writeFileSync(path.join(projectPath, 'visible.ts'), 'x')
    const r = await request(app).get('/api/projects/proj-test/code/tree?filter=all')
    expect(r.status).toBe(200)
    const paths = (r.body.entries as Array<{ path: string }>).map((e) => e.path)
    expect(paths).toContain('visible.ts')
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
    expect(paths.some((p) => p === '.env')).toBe(false)
  })

  it('touched-by-ai filter returns touched files with folder context and provenance rows', async () => {
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'src', 'touched.ts'), 'x')
    fs.writeFileSync(path.join(projectPath, 'untouched.ts'), 'x')
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('src/touched.ts', 42, 'job-1', 'created', Date.now())
    const r = await request(app).get('/api/projects/proj-test/code/tree?filter=touched-by-ai&withProvenance=1')
    expect(r.status).toBe(200)
    const paths = (r.body.entries as Array<{ path: string }>).map((e) => e.path)
    expect(paths).toEqual(['src', 'src/touched.ts'])
    expect(r.body.entries[0].provenance.touchedFileCount).toBe(1)
    expect(r.body.entries[1].provenance.rows).toHaveLength(1)
    expect(r.body.entries[1].provenance.latest).toMatchObject({
      path: 'src/touched.ts',
      ticketId: 42,
      jobId: 'job-1',
      kind: 'created',
    })
  })

  it('touched-by-ai filter can be narrowed to a job', async () => {
    fs.writeFileSync(path.join(projectPath, 'a.ts'), 'x')
    fs.writeFileSync(path.join(projectPath, 'b.ts'), 'x')
    const insert = db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    )
    insert.run('a.ts', 1, 'job-a', 'modified', 1000)
    insert.run('b.ts', 1, 'job-b', 'modified', 1000)
    const r = await request(app).get('/api/projects/proj-test/code/tree?filter=touched-by-ai&withProvenance=1&jobId=job-a')
    expect(r.status).toBe(200)
    const paths = (r.body.entries as Array<{ path: string }>).map((e) => e.path)
    expect(paths).toEqual(['a.ts'])
  })
})

describe('POST /file/regenerate-summary', () => {
  it('enqueues with overrideBudget=true and returns 202', async () => {
    fs.writeFileSync(path.join(projectPath, 'foo.ts'), 'x')
    const res = await request(app)
      .post('/api/projects/proj-test/code/file/regenerate-summary?path=foo.ts')
      .send({ overrideBudget: true })
    expect(res.status).toBe(202)
    expect(res.body.enqueued).toBe(true)
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy.mock.calls[0][0]).toMatchObject({
      relPath: 'foo.ts',
      overrideBudget: true,
      triggeredBy: { kind: 'user', ticketId: null },
    })
  })

  it('rejects path traversal', async () => {
    const res = await request(app)
      .post('/api/projects/proj-test/code/file/regenerate-summary?path=../etc/passwd')
      .send({})
    expect(res.status).toBe(400)
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('rejects binary files before enqueueing', async () => {
    fs.writeFileSync(path.join(projectPath, 'blob.bin'), Buffer.from([0, 1, 2]))
    const res = await request(app)
      .post('/api/projects/proj-test/code/file/regenerate-summary?path=blob.bin')
      .send({})
    expect(res.status).toBe(415)
    expect(res.body.skipped).toBe('binary')
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('rejects files over the preview cap before enqueueing', async () => {
    fs.writeFileSync(path.join(projectPath, 'big.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 0x41))
    const res = await request(app)
      .post('/api/projects/proj-test/code/file/regenerate-summary?path=big.txt')
      .send({})
    expect(res.status).toBe(413)
    expect(res.body.skipped).toBe('too-large')
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})

describe('GET /provenance', () => {
  it('returns rows for a ticket as a JSON array', async () => {
    const now = Date.now()
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('a.ts', 7, 'job-x', 'created', now)
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('b.ts', 7, 'job-x', 'modified', now)
    const res = await request(app).get('/api/projects/proj-test/code/provenance?ticketId=7')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(2)
    expect(res.body[0]).toHaveProperty('path')
    expect(res.body[0]).toHaveProperty('kind')
    expect(res.body[0]).toHaveProperty('jobId')
    expect(res.body[0]).toHaveProperty('at')
  })

  it('returns rows filtered by jobId', async () => {
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('a.ts', 7, 'job-x', 'created', 1000)
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('b.ts', 7, 'job-y', 'modified', 1000)
    const res = await request(app).get('/api/projects/proj-test/code/provenance?jobId=job-x')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { path: 'a.ts', ticketId: 7, jobId: 'job-x', kind: 'created', at: 1000 },
    ])
  })

  it('returns rows filtered by path', async () => {
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('a.ts', 7, 'job-x', 'created', 1000)
    db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('a.ts', 8, 'job-y', 'modified', 2000)
    const res = await request(app).get('/api/projects/proj-test/code/provenance?path=a.ts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { path: 'a.ts', ticketId: 8, jobId: 'job-y', kind: 'modified', at: 2000 },
      { path: 'a.ts', ticketId: 7, jobId: 'job-x', kind: 'created', at: 1000 },
    ])
  })

  it('returns empty array for unknown ticket', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/provenance?ticketId=999')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rejects non-numeric ticketId', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/provenance?ticketId=abc')
    expect(res.status).toBe(400)
  })
})

describe('GET /diff', () => {
  it('returns stored diff for a job/path pair', async () => {
    const result = db.prepare(
      `INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at) VALUES (?, ?, ?, ?, ?)`,
    ).run('a.ts', 7, 'job-x', 'modified', 1000)
    db.prepare(
      `INSERT INTO file_provenance_diffs (provenance_id, patch, truncated) VALUES (?, ?, ?)`,
    ).run(Number(result.lastInsertRowid), 'diff --git a/a.ts b/a.ts\n+hello', 0)
    const res = await request(app).get('/api/projects/proj-test/code/diff?jobId=job-x&path=a.ts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ patch: 'diff --git a/a.ts b/a.ts\n+hello', truncated: false })
  })

  it('returns 404 when the diff was not stored', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/diff?jobId=job-missing&path=a.ts')
    expect(res.status).toBe(404)
  })
})

describe('GET /summary', () => {
  it('returns { summary: null } when no stored summary', async () => {
    const res = await request(app).get('/api/projects/proj-test/code/summary?path=foo.ts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ summary: null })
  })
})
