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

// ─── Category configuration ───────────────────────────────────────────────────

/**
 * Top-level `.md` files are surfaced under a synthetic "guides" category.
 * Any subdirectory becomes its own category, with the directory name as slug
 * and a friendly label resolved from `CATEGORY_LABELS` (or title-cased).
 */
const TOP_LEVEL_CATEGORY_SLUG = 'guides'

const CATEGORY_LABELS: Record<string, string> = {
  guides: 'Guides',
  platforms: 'Platforms',
  internals: 'Internals',
  // Legacy folders (kept so user-customized ~/.specrails/docs trees still work)
  general: 'General',
  product: 'Product',
  engineering: 'Engineering',
  operations: 'Operations',
}

/**
 * Preferred display order. Categories not in this list come after, in the
 * order `fs.readdirSync` returns them.
 */
const CATEGORY_ORDER = ['guides', 'platforms', 'internals', 'general', 'product', 'engineering', 'operations']

/**
 * Preferred document order within the "guides" category. Files not listed
 * here are appended in alphabetical order so adding a new doc never breaks
 * the build.
 */
const GUIDES_DOC_ORDER = [
  'getting-started',
  'creating-specs',
  'running-pipelines',
  'tracking-cost',
  'customizing',
  'terminal',
  'cli',
  'codex',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slugToTitle(slug)
}

function extractTitle(content: string, slug: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : slugToTitle(slug)
}

function sortBy<T>(items: T[], preferredOrder: string[], keyFn: (item: T) => string): T[] {
  const preferredIndex = (key: string) => {
    const i = preferredOrder.indexOf(key)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...items].sort((a, b) => {
    const aKey = keyFn(a)
    const bKey = keyFn(b)
    const ai = preferredIndex(aKey)
    const bi = preferredIndex(bKey)
    if (ai !== bi) return ai - bi
    return aKey.localeCompare(bKey)
  })
}

interface DocEntry { title: string; slug: string }
interface DocCategory { name: string; slug: string; docs: DocEntry[] }

function readMarkdownFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
  } catch {
    return []
  }
}

function readDocEntry(file: string, filePath: string): DocEntry {
  const slug = file.replace(/\.md$/, '')
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { title: extractTitle(content, slug), slug }
  } catch {
    return { title: slugToTitle(slug), slug }
  }
}

function buildCategories(docsDir: string): DocCategory[] {
  if (!fs.existsSync(docsDir)) return []

  const categories: DocCategory[] = []

  // 1. Top-level .md files → "guides" category
  const topFiles = readMarkdownFiles(docsDir)
  if (topFiles.length > 0) {
    const docs = topFiles.map((f) => readDocEntry(f, path.join(docsDir, f)))
    const ordered = sortBy(docs, GUIDES_DOC_ORDER, (d) => d.slug)
    categories.push({ name: categoryLabel(TOP_LEVEL_CATEGORY_SLUG), slug: TOP_LEVEL_CATEGORY_SLUG, docs: ordered })
  }

  // 2. Each subdirectory → its own category
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(docsDir, { withFileTypes: true })
  } catch {
    entries = []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Avoid colliding with synthetic top-level slug
    if (entry.name === TOP_LEVEL_CATEGORY_SLUG) continue

    const catDir = path.join(docsDir, entry.name)
    const files = readMarkdownFiles(catDir)
    const docs = files.map((f) => readDocEntry(f, path.join(catDir, f)))
    // Sort docs within unknown categories alphabetically.
    docs.sort((a, b) => a.slug.localeCompare(b.slug))

    categories.push({ name: categoryLabel(entry.name), slug: entry.name, docs })
  }

  return sortBy(categories, CATEGORY_ORDER, (c) => c.slug)
}

function isValidCategorySlug(cat: string): boolean {
  // basename(cat) === cat guards against slashes, but `path.basename('..') === '..'`,
  // so '.'/'..' slip through and `path.join(docsDir, '..', ...)` escapes one level
  // up (B4). Reject the dot segments explicitly.
  return (
    cat.length > 0 &&
    cat !== '.' &&
    cat !== '..' &&
    cat === path.basename(cat) &&
    !cat.includes('/') &&
    !cat.includes('\\')
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createDocsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const docsDir = resolveDocsDir()
    const categories = buildCategories(docsDir)
    res.json({ categories })
  })

  router.get('/:category/:slug', (req, res) => {
    const { category, slug } = req.params

    if (!isValidCategorySlug(category)) {
      res.status(404).json({ error: 'Category not found' })
      return
    }

    // Prevent directory traversal in slug too
    const safeSlug = path.basename(slug)
    if (safeSlug !== slug || slug.includes('/') || slug.includes('\\')) {
      res.status(400).json({ error: 'Invalid slug' })
      return
    }

    const docsDir = resolveDocsDir()
    // For the synthetic "guides" category, files live at the top level of docsDir.
    const filePath =
      category === TOP_LEVEL_CATEGORY_SLUG
        ? path.join(docsDir, `${safeSlug}.md`)
        : path.join(docsDir, category, `${safeSlug}.md`)

    // B4: defence-in-depth — never serve a file resolved outside docsDir, even
    // if a future change loosens the slug/category validation above.
    const rel = path.relative(path.resolve(docsDir), path.resolve(filePath))
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

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
