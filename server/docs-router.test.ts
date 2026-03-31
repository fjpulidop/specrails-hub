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

    it('includes all known categories in correct order', async () => {
      const res = await request(buildApp()).get('/docs')
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toContain('general')
      expect(slugs).toContain('product')
      expect(slugs).toContain('engineering')
      expect(slugs).toContain('operations')
      expect(slugs).toContain('ux')
      expect(slugs[0]).toBe('general')
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
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })
      fs.writeFileSync(path.join(opsDir, 'my-guide.md'), '# My Guide\n\nContent.')

      const res = await request(buildApp()).get('/docs')
      const opsCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'operations'
      )
      expect(opsCat.docs).toHaveLength(1)
      expect(opsCat.docs[0].slug).toBe('my-guide')
      expect(opsCat.docs[0].title).toBe('My Guide')
    })

    it('falls back to slug-derived title when no H1 in file', async () => {
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })
      fs.writeFileSync(path.join(opsDir, 'no-heading.md'), 'Just some content.')

      const res = await request(buildApp()).get('/docs')
      const opsCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'operations'
      )
      expect(opsCat.docs[0].title).toBe('No Heading')
    })

    it('does not include non-markdown files in docs list', async () => {
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })
      fs.writeFileSync(path.join(opsDir, 'guide.md'), '# Guide')
      fs.writeFileSync(path.join(opsDir, 'ignore.txt'), 'not markdown')

      const res = await request(buildApp()).get('/docs')
      const opsCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'operations'
      )
      expect(opsCat.docs).toHaveLength(1)
      expect(opsCat.docs[0].slug).toBe('guide')
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
      const res = await request(buildApp()).get('/docs/general/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/document not found/i)
    })

    it('returns 404 for engineering (removed section)', async () => {
      const res = await request(buildApp()).get('/docs/engineering/some-doc')
      expect(res.status).toBe(404)
    })

    it('returns 200 with title, content, category, and slug for a valid doc', async () => {
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })
      fs.writeFileSync(path.join(opsDir, 'test-doc.md'), '# Test Doc\n\nHello world.')

      const res = await request(buildApp()).get('/docs/operations/test-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Test Doc')
      expect(res.body.content).toContain('Hello world.')
      expect(res.body.category).toBe('operations')
      expect(res.body.slug).toBe('test-doc')
    })

    it('works for all three valid categories', async () => {
      const categories = ['general', 'product', 'operations']
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
      const genDir = path.join(docsDir, 'general')
      fs.mkdirSync(genDir, { recursive: true })
      fs.writeFileSync(path.join(genDir, 'plain-doc.md'), 'No heading here.')

      const res = await request(buildApp()).get('/docs/general/plain-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Plain Doc')
    })

    it('returns 400 for a slug containing backslash (invalid path)', async () => {
      // Express URL encoding usually handles this, but ensure the router
      // handles edge cases without crashing
      const res = await request(buildApp()).get('/docs/general/bad%5Cslug')
      expect([400, 404]).toContain(res.status)
    })

    it('returns 500 when readFileSync throws on an existing file', async () => {
      const genDir = path.join(docsDir, 'general')
      fs.mkdirSync(genDir, { recursive: true })
      fs.writeFileSync(path.join(genDir, 'read-error.md'), '# Content')

      // Mock readFileSync to throw after existsSync returns true
      const origReadFileSync = fs.readFileSync
      vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
        if (typeof p === 'string' && p.includes('read-error.md')) {
          throw new Error('Permission denied')
        }
        return origReadFileSync(p, ...args as [any])
      })

      const res = await request(buildApp()).get('/docs/general/read-error')
      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Failed to read document')
    })
  })

  // ── Error handling in listing ────────────────────────────────────────────

  describe('GET /docs error handling', () => {
    it('handles readdirSync failure gracefully', async () => {
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })

      // Make readdirSync throw for the operations directory
      const origReaddirSync = fs.readdirSync
      vi.spyOn(fs, 'readdirSync').mockImplementation((p, ...args) => {
        if (typeof p === 'string' && p.includes('operations')) {
          throw new Error('I/O error')
        }
        return origReaddirSync(p, ...args as [any])
      })

      const res = await request(buildApp()).get('/docs')
      expect(res.status).toBe(200)
      const opsCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'operations'
      )
      expect(opsCat.docs).toEqual([])
    })

    it('handles readFileSync failure in doc listing gracefully', async () => {
      const opsDir = path.join(docsDir, 'operations')
      fs.mkdirSync(opsDir, { recursive: true })
      fs.writeFileSync(path.join(opsDir, 'broken.md'), '# Broken')

      const origReadFileSync = fs.readFileSync
      vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
        if (typeof p === 'string' && p.includes('broken.md')) {
          throw new Error('Corrupted file')
        }
        return origReadFileSync(p, ...args as [any])
      })

      const res = await request(buildApp()).get('/docs')
      expect(res.status).toBe(200)
      const opsCat = res.body.categories.find(
        (c: { slug: string }) => c.slug === 'operations'
      )
      // Should use slug-derived title as fallback
      expect(opsCat.docs[0].title).toBe('Broken')
    })

    it('uses bundled docs when user docs dir does not exist', async () => {
      // Point homedir to a dir without .specrails/docs
      const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-empty-'))
      vi.spyOn(os, 'homedir').mockReturnValue(emptyHome)

      const res = await request(buildApp()).get('/docs')
      expect(res.status).toBe(200)
      // Should still return categories (bundled or empty fallback)
      expect(res.body.categories).toBeDefined()
      expect(res.body.categories.length).toBe(5)

      fs.rmSync(emptyHome, { recursive: true, force: true })
    })
  })
})
