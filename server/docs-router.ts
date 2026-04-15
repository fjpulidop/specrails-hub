import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ─── Docs directory resolution ────────────────────────────────────────────────

// Try ~/.specrails/docs/ first (user-editable), then fall back to bundled docs/
function resolveDocsDir(): string {
  const userDocsDir = path.join(os.homedir(), '.specrails', 'docs')
  if (fs.existsSync(userDocsDir)) {
    return userDocsDir
  }

  // Bundled docs: try relative to this file (works in dev and compiled)
  const candidates = [
    path.resolve(__dirname, '../docs'),   // dev: server/ -> ../docs
    path.resolve(__dirname, '../../docs'), // compiled: server/dist/ -> ../../docs
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Fall back to user dir (will be empty until populated)
  return userDocsDir
}

// ─── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES = ['general', 'product', 'engineering', 'operations'] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  general: 'General',
  product: 'Product',
  engineering: 'Engineering',
  operations: 'Operations',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractTitle(content: string, slug: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : slugToTitle(slug)
}

function isValidCategory(cat: string): cat is Category {
  return CATEGORIES.includes(cat as Category)
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createDocsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const docsDir = resolveDocsDir()

    const categories = CATEGORIES.map((cat) => {
      const catDir = path.join(docsDir, cat)

      if (!fs.existsSync(catDir)) {
        return { name: CATEGORY_LABELS[cat], slug: cat, docs: [] }
      }

      let files: string[]
      try {
        files = fs.readdirSync(catDir).filter((f) => f.endsWith('.md'))
      } catch {
        files = []
      }

      const docs = files.map((f) => {
        const slug = f.replace(/\.md$/, '')
        try {
          const content = fs.readFileSync(path.join(catDir, f), 'utf-8')
          return { title: extractTitle(content, slug), slug }
        } catch {
          return { title: slugToTitle(slug), slug }
        }
      })

      return { name: CATEGORY_LABELS[cat], slug: cat, docs }
    })

    res.json({ categories })
  })

  router.get('/:category/:slug', (req, res) => {
    const { category, slug } = req.params

    if (!isValidCategory(category)) {
      res.status(404).json({ error: 'Category not found' })
      return
    }

    // Prevent directory traversal
    const safeSlug = path.basename(slug)
    if (safeSlug !== slug || slug.includes('/') || slug.includes('\\')) {
      res.status(400).json({ error: 'Invalid slug' })
      return
    }

    const docsDir = resolveDocsDir()
    const filePath = path.join(docsDir, category, `${safeSlug}.md`)

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      res.status(500).json({ error: 'Failed to read document' })
      return
    }

    const title = extractTitle(content, safeSlug)
    res.json({ title, content, category, slug: safeSlug })
  })

  return router
}
