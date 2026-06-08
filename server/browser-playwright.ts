// Real Playwright/CDP implementation of the browser-capture abstractions.
//
// This is the ONLY module that imports `playwright`. It is excluded from coverage
// (see vitest.config.ts) because every branch requires a live Chromium — the unit
// tests drive `BrowserCaptureManager` through a fake `ContextLauncher` instead.
//
// Screencast uses CDP (`Page.startScreencast`) since Playwright exposes no
// screencast API; input + screenshot + DOM use Playwright's high-level page API.

import type {
  BrowserContextHandle,
  BrowserPageHandle,
  BrowserInputEvent,
  CaptureRect,
  CapturedDom,
  ContextLauncher,
  ElementProbe,
  ScreencastFrame,
} from './browser-capture-types'
import { resolveBundledChromiumPath } from './chromium-resolver'

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'about:blank'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('about:')) return trimmed
  return `https://${trimmed}`
}

class PlaywrightPageHandle implements BrowserPageHandle {
  // `page` and `cdp` are deliberately `any` — we don't want a hard type-level
  // dependency on playwright's exported types leaking through the abstraction.
  private cdp: any = null
  private screencastHandler: ((frame: ScreencastFrame) => void) | null = null

  constructor(private readonly page: any) {}

  private async navResult(): Promise<{ url: string; title: string }> {
    let title = ''
    try { title = await this.page.title() } catch { /* about:blank etc */ }
    return { url: this.page.url(), title }
  }

  async goto(url: string): Promise<{ url: string; title: string }> {
    try {
      await this.page.goto(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } catch {
      // A failed navigation (bad host, timeout) should not crash the session — the
      // user just sees whatever the page settled on.
    }
    return this.navResult()
  }

  async goBack(): Promise<{ url: string; title: string }> {
    try { await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 }) } catch { /* no history */ }
    return this.navResult()
  }

  async goForward(): Promise<{ url: string; title: string }> {
    try { await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: 30_000 }) } catch { /* no history */ }
    return this.navResult()
  }

  async reload(): Promise<{ url: string; title: string }> {
    try { await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }) } catch { /* ignore */ }
    return this.navResult()
  }

  currentUrl(): string {
    return this.page.url()
  }

  async currentTitle(): Promise<string> {
    try { return await this.page.title() } catch { return '' }
  }

  async setViewport(width: number, height: number): Promise<void> {
    try { await this.page.setViewportSize({ width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }) } catch { /* ignore */ }
  }

  async dispatchInput(event: BrowserInputEvent): Promise<void> {
    try {
      if (event.type === 'mouse') {
        if (event.action === 'move') await this.page.mouse.move(event.x, event.y)
        else if (event.action === 'down') await this.page.mouse.down({ button: event.button ?? 'left', clickCount: event.clickCount ?? 1 })
        else await this.page.mouse.up({ button: event.button ?? 'left', clickCount: event.clickCount ?? 1 })
      } else if (event.type === 'wheel') {
        await this.page.mouse.move(event.x, event.y)
        await this.page.mouse.wheel(event.deltaX, event.deltaY)
      } else if (event.type === 'key') {
        if (event.action === 'down') {
          if (event.text && event.text.length >= 1 && [...event.text].length === 1) {
            await this.page.keyboard.insertText(event.text)
          } else {
            await this.page.keyboard.down(event.key)
          }
        } else {
          // Only release named (non-text) keys — text was inserted on down.
          if (!event.text) await this.page.keyboard.up(event.key)
        }
      } else if (event.type === 'resize') {
        await this.setViewport(event.width, event.height)
      }
    } catch {
      // Input on a navigating/closed page can throw; never let it bubble.
    }
  }

  async startScreencast(onFrame: (frame: ScreencastFrame) => void): Promise<void> {
    if (this.screencastHandler) return
    this.screencastHandler = onFrame
    const ctx = this.page.context()
    this.cdp = await ctx.newCDPSession(this.page)
    this.cdp.on('Page.screencastFrame', async (evt: { data: string; sessionId: number; metadata?: { deviceWidth?: number; deviceHeight?: number } }) => {
      try {
        this.screencastHandler?.({
          data: Buffer.from(evt.data, 'base64'),
          width: evt.metadata?.deviceWidth ?? 0,
          height: evt.metadata?.deviceHeight ?? 0,
        })
      } finally {
        try { await this.cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId }) } catch { /* ignore */ }
      }
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
  }

  async stopScreencast(): Promise<void> {
    this.screencastHandler = null
    if (this.cdp) {
      try { await this.cdp.send('Page.stopScreencast') } catch { /* ignore */ }
      try { await this.cdp.detach() } catch { /* ignore */ }
      this.cdp = null
    }
  }

  async screenshotClip(rect: CaptureRect): Promise<Buffer> {
    const clip = {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }
    return this.page.screenshot({ clip, type: 'png' })
  }

  async extractDom(rect: CaptureRect, htmlByteCap: number): Promise<CapturedDom> {
    // We can't pass `domExtractScript` directly to page.evaluate: under tsx/esbuild
    // `keepNames` the compiled function body references a module-local `__name`
    // helper that doesn't exist in the page context (→ "ReferenceError: __name is
    // not defined"). Serialise the function to source and run it inside a wrapper
    // that defines a no-op `__name`, so it works under both tsx (dev) and the
    // esbuild sidecar bundle. Args are JSON-inlined (no external refs needed).
    const arg = { rect, htmlByteCap }
    const src = `(() => { const __name = (f) => f; return (${domExtractScript.toString()})(${JSON.stringify(arg)}); })()`
    const raw = (await this.page.evaluate(src)) as ReturnType<typeof domExtractScript>
    return {
      url: this.page.url(),
      title: await this.currentTitle(),
      viewport: raw.viewport,
      rect,
      html: raw.html,
      htmlTruncated: raw.htmlTruncated,
      css: raw.css,
      cssTruncated: raw.cssTruncated,
      nodes: raw.nodes,
      capturedAt: new Date().toISOString(),
    }
  }

  async probeElementAt(point: { x: number; y: number }): Promise<ElementProbe | null> {
    try {
      // Inline arrow with no inner named functions → esbuild/tsx won't inject the
      // `__name` helper, so it's safe to pass directly to page.evaluate.
      return await this.page.evaluate((p: { x: number; y: number }) => {
        const el = document.elementFromPoint(p.x, p.y)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { rect: { x: b.x, y: b.y, width: b.width, height: b.height }, tag: el.tagName.toLowerCase() }
      }, point)
    } catch {
      return null
    }
  }

  async close(): Promise<void> {
    await this.stopScreencast()
    try { await this.page.close() } catch { /* ignore */ }
  }
}

// Serialised into the page via page.evaluate. Self-contained: no closures over
// Node scope. Returns the html + nodes; the Node side stamps url/title/time.
function domExtractScript(arg: { rect: CaptureRect; htmlByteCap: number }): {
  viewport: { width: number; height: number }
  html: string
  htmlTruncated: boolean
  css: string
  cssTruncated: boolean
  nodes: Array<{
    tag: string
    role: string | null
    text: string | null
    rect: { x: number; y: number; width: number; height: number }
    attributes: Record<string, string>
    styles: Record<string, string>
  }>
} {
  const { rect, htmlByteCap } = arg
  const NODE_CAP = 60
  const CSS_CAP = 60_000
  const TEXT_CAP = 240

  const implicitRole = (el: Element): string | null => {
    const tag = el.tagName.toLowerCase()
    const map: Record<string, string> = {
      a: (el as HTMLAnchorElement).getAttribute('href') ? 'link' : 'generic',
      button: 'button',
      nav: 'navigation',
      header: 'banner',
      footer: 'contentinfo',
      main: 'main',
      h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
      img: 'img',
      ul: 'list', ol: 'list', li: 'listitem',
      table: 'table', tr: 'row', td: 'cell', th: 'columnheader',
      select: 'combobox', textarea: 'textbox',
      form: 'form', label: 'label', section: 'region', article: 'article',
    }
    if (tag === 'input') {
      const t = (el as HTMLInputElement).type
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      if (t === 'button' || t === 'submit') return 'button'
      return 'textbox'
    }
    return el.getAttribute('role') || map[tag] || null
  }

  const collectAttrs = (el: Element): Record<string, string> => {
    const out: Record<string, string> = {}
    const keep = new Set(['id', 'class', 'name', 'href', 'src', 'type', 'placeholder', 'alt', 'title', 'value', 'aria-label'])
    for (const a of Array.from(el.attributes)) {
      if (keep.has(a.name) || a.name.startsWith('aria-') || a.name.startsWith('data-')) {
        out[a.name] = a.value.slice(0, 200)
      }
    }
    return out
  }

  const STYLE_KEYS = ['display', 'position', 'color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontFamily', 'padding', 'margin', 'border', 'borderRadius', 'textAlign']
  const collectStyles = (el: Element): Record<string, string> => {
    const cs = window.getComputedStyle(el)
    const out: Record<string, string> = {}
    for (const k of STYLE_KEYS) {
      const v = cs.getPropertyValue(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())) || (cs as unknown as Record<string, string>)[k]
      if (v) out[k] = String(v).slice(0, 120)
    }
    return out
  }

  // Sample a grid of points across the selection to discover candidate elements.
  const candidates = new Set<Element>()
  const cols = 5, rows = 5
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const px = rect.x + (rect.width * i) / cols
      const py = rect.y + (rect.height * j) / rows
      const stack = document.elementsFromPoint(px, py)
      if (stack && stack.length > 0) candidates.add(stack[0])
    }
  }

  // Container = smallest element whose box contains the whole selection rect.
  const rectRight = rect.x + rect.width
  const rectBottom = rect.y + rect.height
  let container: Element = document.body
  let containerArea = Infinity
  const seedSet = candidates.size > 0 ? candidates : new Set<Element>([document.body])
  for (const seed of seedSet) {
    let el: Element | null = seed
    while (el) {
      const b = el.getBoundingClientRect()
      if (b.left <= rect.x + 1 && b.top <= rect.y + 1 && b.right >= rectRight - 1 && b.bottom >= rectBottom - 1) {
        const area = b.width * b.height
        if (area < containerArea) { containerArea = area; container = el }
        break
      }
      el = el.parentElement
    }
  }

  // Build node list: container + intersecting candidates (capped).
  const nodeEls: Element[] = []
  const pushUnique = (el: Element) => { if (!nodeEls.includes(el) && nodeEls.length < NODE_CAP) nodeEls.push(el) }
  pushUnique(container)
  for (const c of candidates) pushUnique(c)

  const nodes = nodeEls.map((el) => {
    const b = el.getBoundingClientRect()
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      tag: el.tagName.toLowerCase(),
      role: implicitRole(el),
      text: text ? text.slice(0, TEXT_CAP) : null,
      rect: { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) },
      attributes: collectAttrs(el),
      styles: collectStyles(el),
    }
  })

  // Pretty-print the container subtree (scripts/styles/svg dropped) with one
  // element per line, indented by depth — readable in the panel AND clearer for
  // the AI than a single-line outerHTML. Element-with-only-text collapses to one
  // line; long attribute values (data: URIs etc.) are truncated.
  let html = ''
  let htmlTruncated = false
  try {
    const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
    const SKIP = new Set(['script', 'style', 'noscript', 'svg'])
    const ATTR_CAP = 200
    const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Escape < and > inside attribute values too so the client HTML tokenizer can
    // reliably split tags on '>' (a raw '>' in an attr value would break it).
    const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines: string[] = []
    const openTag = (el: Element) => {
      const attrs = Array.from(el.attributes).map((a) => {
        let v = a.value
        if (v.length > ATTR_CAP) v = v.slice(0, ATTR_CAP) + '…'
        return ` ${a.name}="${escAttr(v)}"`
      }).join('')
      return `<${el.tagName.toLowerCase()}${attrs}>`
    }
    const serialize = (node: Node, depth: number) => {
      const pad = '  '.repeat(depth)
      if (node.nodeType === 3) {
        const t = (node.textContent || '').replace(/\s+/g, ' ').trim()
        if (t) lines.push(pad + escText(t))
        return
      }
      if (node.nodeType !== 1) return
      const el = node as Element
      const tag = el.tagName.toLowerCase()
      if (SKIP.has(tag)) return
      if (VOID.has(tag)) { lines.push(pad + openTag(el)); return }
      const kids = Array.from(el.childNodes).filter(
        (c) => c.nodeType === 1 || (c.nodeType === 3 && !!(c.textContent || '').trim()),
      )
      if (kids.length === 0) { lines.push(`${pad}${openTag(el)}</${tag}>`); return }
      if (kids.length === 1 && kids[0].nodeType === 3) {
        const t = escText((el.textContent || '').replace(/\s+/g, ' ').trim())
        lines.push(`${pad}${openTag(el)}${t}</${tag}>`)
        return
      }
      lines.push(pad + openTag(el))
      for (const c of kids) serialize(c, depth + 1)
      lines.push(`${pad}</${tag}>`)
    }
    serialize(container, 0)
    html = lines.join('\n')
    if (html.length > htmlByteCap) {
      html = html.slice(0, htmlByteCap)
      // Trim back to the last complete tag so we never emit a half-written tag.
      const lastGt = html.lastIndexOf('>')
      if (lastGt > 0) html = html.slice(0, lastGt + 1)
      htmlTruncated = true
    }
  } catch {
    html = ''
  }

  // Collect the CSS rules that actually apply to the captured elements (plus
  // :root / html custom-property declarations for design tokens), so the AI can
  // replicate the styling instead of guessing. Same-origin stylesheets only —
  // cross-origin .cssRules access throws and is skipped. @media rules whose inner
  // rules match are kept whole. Capped.
  let css = ''
  let cssTruncated = false
  try {
    const targets = [container, ...nodeEls]
    const seen = new Set<string>()
    const out: string[] = []
    // Bound work on rule-heavy sites (matches() per target per rule).
    let budget = 12000
    const selCache = new Map<string, boolean>()
    const matchesAny = (selector: string): boolean => {
      for (const el of targets) {
        try { if (el.matches(selector)) return true } catch { /* invalid selector */ }
      }
      return false
    }
    // Memoise by selector text so repeated selectors don't re-run matches().
    const considerStyleRule = (r: CSSStyleRule): string | null => {
      const sel = r.selectorText
      if (!sel) return null
      let ok = selCache.get(sel)
      if (ok === undefined) {
        if (budget <= 0) return null
        budget--
        const isToken = /:root|(^|,)\s*html\b|(^|,)\s*\*(\s|,|$)/.test(sel)
        ok = isToken || matchesAny(sel)
        selCache.set(sel, ok)
      }
      return ok ? r.cssText : null
    }
    // The @-prefix for a conditional grouping rule (media/supports/container/layer),
    // feature-detected so we don't hard-reference constructors missing from older
    // lib typings or runtimes.
    const groupingPrefix = (rule: CSSRule): string | null => {
      const r = rule as unknown as { conditionText?: string; name?: string }
      const ctorName = (rule as { constructor?: { name?: string } }).constructor?.name
      if (ctorName === 'CSSMediaRule') return `@media ${r.conditionText ?? ''}`
      if (ctorName === 'CSSSupportsRule') return `@supports ${r.conditionText ?? ''}`
      if (ctorName === 'CSSContainerRule') return `@container ${r.conditionText ?? ''}`
      if (ctorName === 'CSSLayerBlockRule') return `@layer ${r.name ?? ''}`
      return null
    }
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          const t = considerStyleRule(rule)
          if (t && !seen.has(t)) { seen.add(t); out.push(t) }
          continue
        }
        const inner = (rule as unknown as { cssRules?: CSSRuleList }).cssRules
        const prefix = groupingPrefix(rule)
        if (prefix && inner) {
          const innerMatched: string[] = []
          for (const sub of Array.from(inner)) {
            if (sub instanceof CSSStyleRule) {
              const t = considerStyleRule(sub)
              if (t) innerMatched.push(t)
            }
          }
          if (innerMatched.length > 0) {
            const block = `${prefix.trim()} {\n  ${innerMatched.join('\n  ')}\n}`
            if (!seen.has(block)) { seen.add(block); out.push(block) }
          }
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null
      try { rules = sheet.cssRules } catch { rules = null } // cross-origin — skipped
      if (rules) walk(rules)
    }
    css = out.join('\n')
    if (css.length > CSS_CAP) { css = css.slice(0, CSS_CAP); cssTruncated = true }
  } catch {
    css = ''
  }

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    html,
    htmlTruncated,
    css,
    cssTruncated,
    nodes,
  }
}

class PlaywrightContextHandle implements BrowserContextHandle {
  // A persistent context opens with one blank page. Consume it for the FIRST
  // session only; every later session gets its own fresh page. Reusing pages[0]
  // for every session made concurrent sessions (e.g. React StrictMode's
  // mount→unmount→mount double-create) share one page — killing the throwaway
  // first session then closed the page out from under the live second session.
  private usedInitial = false
  constructor(private readonly context: any) {}
  async newPage(): Promise<BrowserPageHandle> {
    let page: any
    if (!this.usedInitial) {
      this.usedInitial = true
      const pages = this.context.pages()
      page = pages.length > 0 ? pages[0] : await this.context.newPage()
    } else {
      page = await this.context.newPage()
    }
    return new PlaywrightPageHandle(page)
  }
  async close(): Promise<void> {
    try { await this.context.close() } catch { /* ignore */ }
  }
}

/**
 * Build the real Playwright-backed launcher. Lazy-imports playwright so the
 * dependency is only loaded when the feature is actually used.
 */
export function createPlaywrightLauncher(): ContextLauncher {
  return async (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = (await import('playwright')) as typeof import('playwright')
    const executablePath = opts.executablePath ?? resolveBundledChromiumPath() ?? undefined
    const context = await chromium.launchPersistentContext(opts.userDataDir, {
      headless: true,
      executablePath,
      viewport: opts.viewport,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    return new PlaywrightContextHandle(context)
  }
}
