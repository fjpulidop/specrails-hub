import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { createDocsRouter } from './docs-router'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express()
  app.use('/docs', createDocsRouter())
  return app
}

// Create a real temp homedir so resolveDocsDir() picks it up correctly.
// Structure: tmpHome/.specrails/docs/{category}/*.md
function makeTempHome(): { home: string; docsDir: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-home-test-'))
  const docsDir = path.join(home, '.specrails', 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  return { home, docsDir }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('docs-router', () => {
  let home: string
  let docsDir: string

  beforeEach(() => {
    ;({ home, docsDir } = makeTempHome())
    vi.spyOn(os, 'homedir').mockReturnValue(home)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(home, { recursive: true, force: true })
  })

  // ── GET / ──────────────────────────────────────────────────────────────────

  describe('GET /docs', () => {
    it('returns 200 with a categories array', async () => {
      const res = await request(buildApp()).get('/docs')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('categories')
      expect(Array.isArray(res.body.categories)).toBe(true)
    })

    it('includes all four known categories in the response', async () => {
      const res = await request(buildApp()).get('/docs')
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toContain('engineering')
      expect(slugs).toContain('product')
      expect(slugs).toContain('operations')
      expect(slugs).toContain('general')
    })

    it('returns empty docs array for categories with no files', async () => {
      // No files created — all category dirs are absent
      const res = await request(buildApp()).get('/docs')
      for (const cat of res.body.categories) {
        expect(Array.isArray(cat.docs)).toBe(true)
        expect(cat.docs).toHaveLength(0)
      }
    })

    it('lists markdown files from an existing category dir', async () => {
      const engDir = path.join(docsDir, 'engineering')
      fs.mkdirSync(engDir, { recursive: true })
      fs.writeFileSync(path.join(engDir, 'my-guide.md'), '# My Guide\n\nContent.')

      const res = await request(buildApp()).get('/docs')
      const engCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'engineering'
      )
      expect(engCat.docs).toHaveLength(1)
      expect(engCat.docs[0].slug).toBe('my-guide')
      expect(engCat.docs[0].title).toBe('My Guide')
    })

    it('falls back to slug-derived title when no H1 in file', async () => {
      const engDir = path.join(docsDir, 'engineering')
      fs.mkdirSync(engDir, { recursive: true })
      fs.writeFileSync(path.join(engDir, 'no-heading.md'), 'Just some content.')

      const res = await request(buildApp()).get('/docs')
      const engCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'engineering'
      )
      expect(engCat.docs[0].title).toBe('No Heading')
    })

    it('does not include non-markdown files in docs list', async () => {
      const engDir = path.join(docsDir, 'engineering')
      fs.mkdirSync(engDir, { recursive: true })
      fs.writeFileSync(path.join(engDir, 'guide.md'), '# Guide')
      fs.writeFileSync(path.join(engDir, 'ignore.txt'), 'not markdown')

      const res = await request(buildApp()).get('/docs')
      const engCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'engineering'
      )
      expect(engCat.docs).toHaveLength(1)
      expect(engCat.docs[0].slug).toBe('guide')
    })
  })

  // ── GET /:category/:slug ───────────────────────────────────────────────────

  describe('GET /docs/:category/:slug', () => {
    it('returns 404 for an unknown category', async () => {
      const res = await request(buildApp()).get('/docs/unknown-cat/some-doc')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/category not found/i)
    })

    it('returns 404 when the document file does not exist', async () => {
      const res = await request(buildApp()).get('/docs/engineering/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/document not found/i)
    })

    it('returns 200 with title, content, category, and slug for a valid doc', async () => {
      const engDir = path.join(docsDir, 'engineering')
      fs.mkdirSync(engDir, { recursive: true })
      fs.writeFileSync(path.join(engDir, 'test-doc.md'), '# Test Doc\n\nHello world.')

      const res = await request(buildApp()).get('/docs/engineering/test-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Test Doc')
      expect(res.body.content).toContain('Hello world.')
      expect(res.body.category).toBe('engineering')
      expect(res.body.slug).toBe('test-doc')
    })

    it('works for all four valid categories', async () => {
      const categories = ['engineering', 'product', 'operations', 'general']
      for (const cat of categories) {
        const catDir = path.join(docsDir, cat)
        fs.mkdirSync(catDir, { recursive: true })
        fs.writeFileSync(path.join(catDir, 'sample.md'), `# Sample ${cat}\n\nContent.`)

        const res = await request(buildApp()).get(`/docs/${cat}/sample`)
        expect(res.status).toBe(200)
        expect(res.body.category).toBe(cat)
      }
    })

    it('derives title from slug when file has no H1', async () => {
      const engDir = path.join(docsDir, 'engineering')
      fs.mkdirSync(engDir, { recursive: true })
      fs.writeFileSync(path.join(engDir, 'plain-doc.md'), 'No heading here.')

      const res = await request(buildApp()).get('/docs/engineering/plain-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Plain Doc')
    })

    it('returns 400 for a slug containing backslash (invalid path)', async () => {
      // Express URL encoding usually handles this, but ensure the router
      // handles edge cases without crashing
      const res = await request(buildApp()).get('/docs/engineering/bad%5Cslug')
      expect([400, 404]).toContain(res.status)
    })
  })
})
