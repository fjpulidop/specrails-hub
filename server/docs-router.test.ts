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
// Structure: tmpHome/.specrails/docs/{<top-level .md>, <subdir>/<.md>}
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

    it('returns empty categories array when docs dir is empty', async () => {
      const res = await request(buildApp()).get('/docs')
      expect(res.body.categories).toEqual([])
    })

    it('surfaces top-level .md files under the synthetic "guides" category', async () => {
      fs.writeFileSync(path.join(docsDir, 'getting-started.md'), '# Getting started\n\nHello.')
      fs.writeFileSync(path.join(docsDir, 'cli.md'), '# CLI\n\nHello.')

      const res = await request(buildApp()).get('/docs')
      const guides = res.body.categories.find((c: { slug: string }) => c.slug === 'guides')
      expect(guides).toBeDefined()
      expect(guides.name).toBe('Guides')
      expect(guides.docs.map((d: { slug: string }) => d.slug)).toContain('getting-started')
      expect(guides.docs.map((d: { slug: string }) => d.slug)).toContain('cli')
    })

    it('orders guides docs by preferred order then alphabetically', async () => {
      // Write in a weird order
      fs.writeFileSync(path.join(docsDir, 'cli.md'), '# CLI')
      fs.writeFileSync(path.join(docsDir, 'unknown-doc.md'), '# Unknown')
      fs.writeFileSync(path.join(docsDir, 'getting-started.md'), '# Getting started')
      fs.writeFileSync(path.join(docsDir, 'running-pipelines.md'), '# Running pipelines')

      const res = await request(buildApp()).get('/docs')
      const guides = res.body.categories.find((c: { slug: string }) => c.slug === 'guides')
      const slugs = guides.docs.map((d: { slug: string }) => d.slug)
      // Known docs first, in preferred order
      expect(slugs.indexOf('getting-started')).toBeLessThan(slugs.indexOf('running-pipelines'))
      expect(slugs.indexOf('running-pipelines')).toBeLessThan(slugs.indexOf('cli'))
      // Unknown doc lands after the known ones
      expect(slugs.indexOf('cli')).toBeLessThan(slugs.indexOf('unknown-doc'))
    })

    it('excludes README.md from the guides listing', async () => {
      fs.writeFileSync(path.join(docsDir, 'README.md'), '# Index')
      fs.writeFileSync(path.join(docsDir, 'getting-started.md'), '# Getting started')

      const res = await request(buildApp()).get('/docs')
      const guides = res.body.categories.find((c: { slug: string }) => c.slug === 'guides')
      const slugs = guides.docs.map((d: { slug: string }) => d.slug)
      expect(slugs).not.toContain('README')
      expect(slugs).toContain('getting-started')
    })

    it('each subdirectory becomes its own category', async () => {
      const internalsDir = path.join(docsDir, 'internals')
      fs.mkdirSync(internalsDir)
      fs.writeFileSync(path.join(internalsDir, 'architecture.md'), '# Architecture')

      const platformsDir = path.join(docsDir, 'platforms')
      fs.mkdirSync(platformsDir)
      fs.writeFileSync(path.join(platformsDir, 'macos.md'), '# macOS notes')

      const res = await request(buildApp()).get('/docs')
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toContain('internals')
      expect(slugs).toContain('platforms')
    })

    it('honours preferred category order: guides → platforms → internals', async () => {
      // Write subdirectories first
      fs.mkdirSync(path.join(docsDir, 'internals'))
      fs.writeFileSync(path.join(docsDir, 'internals', 'x.md'), '# X')
      fs.mkdirSync(path.join(docsDir, 'platforms'))
      fs.writeFileSync(path.join(docsDir, 'platforms', 'y.md'), '# Y')
      // Then a top-level doc
      fs.writeFileSync(path.join(docsDir, 'getting-started.md'), '# Getting started')

      const res = await request(buildApp()).get('/docs')
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toEqual(['guides', 'platforms', 'internals'])
    })

    it('uses friendly labels for known categories', async () => {
      fs.mkdirSync(path.join(docsDir, 'internals'))
      fs.writeFileSync(path.join(docsDir, 'internals', 'x.md'), '# X')
      const res = await request(buildApp()).get('/docs')
      const internals = res.body.categories.find((c: { slug: string }) => c.slug === 'internals')
      expect(internals.name).toBe('Internals')
    })

    it('title-cases unknown category names', async () => {
      fs.mkdirSync(path.join(docsDir, 'my-custom-section'))
      fs.writeFileSync(path.join(docsDir, 'my-custom-section', 'x.md'), '# X')
      const res = await request(buildApp()).get('/docs')
      const custom = res.body.categories.find((c: { slug: string }) => c.slug === 'my-custom-section')
      expect(custom.name).toBe('My Custom Section')
    })

    it('falls back to slug-derived title when no H1 in file', async () => {
      fs.writeFileSync(path.join(docsDir, 'no-heading.md'), 'Just some content.')

      const res = await request(buildApp()).get('/docs')
      const guides = res.body.categories.find((c: { slug: string }) => c.slug === 'guides')
      const doc = guides.docs.find((d: { slug: string }) => d.slug === 'no-heading')
      expect(doc.title).toBe('No Heading')
    })

    it('does not include non-markdown files', async () => {
      fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide')
      fs.writeFileSync(path.join(docsDir, 'ignore.txt'), 'not markdown')

      const res = await request(buildApp()).get('/docs')
      const guides = res.body.categories.find((c: { slug: string }) => c.slug === 'guides')
      const slugs = guides.docs.map((d: { slug: string }) => d.slug)
      expect(slugs).toEqual(['guide'])
    })

    it('legacy `general`/`product`/`engineering`/`operations` subdirs still work', async () => {
      // Backwards-compat for user-customised ~/.specrails/docs trees
      for (const cat of ['general', 'product', 'engineering', 'operations']) {
        const dir = path.join(docsDir, cat)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'item.md'), `# ${cat} item`)
      }
      const res = await request(buildApp()).get('/docs')
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toContain('general')
      expect(slugs).toContain('product')
      expect(slugs).toContain('engineering')
      expect(slugs).toContain('operations')
    })
  })

  // ── GET /:category/:slug ───────────────────────────────────────────────────

  describe('GET /docs/:category/:slug', () => {
    it('returns 404 when the document file does not exist', async () => {
      const res = await request(buildApp()).get('/docs/guides/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/document not found/i)
    })

    it('serves top-level .md files under the "guides" category', async () => {
      fs.writeFileSync(path.join(docsDir, 'test-doc.md'), '# Test Doc\n\nHello world.')

      const res = await request(buildApp()).get('/docs/guides/test-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Test Doc')
      expect(res.body.content).toContain('Hello world.')
      expect(res.body.category).toBe('guides')
      expect(res.body.slug).toBe('test-doc')
    })

    it('serves files from subdirectory categories', async () => {
      const dir = path.join(docsDir, 'internals')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'architecture.md'), '# Architecture\n\nBody.')

      const res = await request(buildApp()).get('/docs/internals/architecture')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Architecture')
      expect(res.body.category).toBe('internals')
    })

    it('derives title from slug when file has no H1', async () => {
      fs.writeFileSync(path.join(docsDir, 'plain-doc.md'), 'No heading here.')

      const res = await request(buildApp()).get('/docs/guides/plain-doc')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Plain Doc')
    })

    it('returns 400 or 404 for a slug containing backslash (invalid path)', async () => {
      const res = await request(buildApp()).get('/docs/guides/bad%5Cslug')
      expect([400, 404]).toContain(res.status)
    })

    it('B4: rejects a ".." category and does not read one level above docsDir', async () => {
      // Plant a markdown file one level above docsDir; '..' as the category would
      // resolve there if the dot-segment guard were missing.
      const aboveDir = path.dirname(docsDir)
      fs.writeFileSync(path.join(aboveDir, 'secret.md'), '# Secret')
      // URL-encode the dots so '..' reaches the route param instead of being
      // collapsed by URL normalization before routing.
      const res = await request(buildApp()).get('/docs/%2e%2e/secret')
      expect([400, 404]).toContain(res.status)
      // Ensure the secret content was never served.
      expect(JSON.stringify(res.body)).not.toContain('Secret')
    })

    it('returns 500 when readFileSync throws on an existing file', async () => {
      fs.writeFileSync(path.join(docsDir, 'read-error.md'), '# Content')

      const origReadFileSync = fs.readFileSync
      vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
        if (typeof p === 'string' && p.includes('read-error.md')) {
          throw new Error('Permission denied')
        }
        return origReadFileSync(p, ...args as [any])
      })

      const res = await request(buildApp()).get('/docs/guides/read-error')
      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Failed to read document')
    })
  })

  // ── Bundled fallback ───────────────────────────────────────────────────────

  describe('bundled fallback', () => {
    it('falls back to the bundled docs dir when ~/.specrails/docs/ does not exist', async () => {
      // Point homedir to a dir without .specrails/docs
      const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-empty-'))
      vi.spyOn(os, 'homedir').mockReturnValue(emptyHome)

      const res = await request(buildApp()).get('/docs')
      expect(res.status).toBe(200)
      // Bundled docs/ at the repo root carries at least the guides + internals layout.
      expect(res.body.categories.length).toBeGreaterThan(0)
      const slugs = res.body.categories.map((c: { slug: string }) => c.slug)
      expect(slugs).toContain('guides')

      fs.rmSync(emptyHome, { recursive: true, force: true })
    })
  })
})
