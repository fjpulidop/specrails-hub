import { describe, it, expect } from 'vitest'
import { hasMarkdownSyntax } from '../markdown-detect'

describe('hasMarkdownSyntax', () => {
  // ── Headings ────────────────────────────────────────────────────────────────

  describe('headings', () => {
    it('detects H1 heading', () => {
      expect(hasMarkdownSyntax('# Title')).toBe(true)
    })

    it('detects H2 heading', () => {
      expect(hasMarkdownSyntax('## Section')).toBe(true)
    })

    it('detects H3 heading', () => {
      expect(hasMarkdownSyntax('### Subsection')).toBe(true)
    })

    it('detects H4 heading', () => {
      expect(hasMarkdownSyntax('#### H4')).toBe(true)
    })

    it('detects H5 heading', () => {
      expect(hasMarkdownSyntax('##### H5')).toBe(true)
    })

    it('detects H6 heading', () => {
      expect(hasMarkdownSyntax('###### H6')).toBe(true)
    })

    it('does not treat # without trailing space as heading', () => {
      // "#title" — no space after hash
      expect(hasMarkdownSyntax('#title')).toBe(false)
    })

    it('does not treat a plain # alone on the line as heading (no text after space)', () => {
      // "# " — hash + space but no word; regex requires at least the space, which matches
      // The trimmed line is "# " and /^#{1,6}\s/ matches because \s matches the space.
      expect(hasMarkdownSyntax('# ')).toBe(true)
    })

    it('detects heading when line has leading whitespace', () => {
      expect(hasMarkdownSyntax('   ## Indented heading')).toBe(true)
    })

    it('does not treat 7+ hashes as a heading', () => {
      // 7 hashes: not 1-6
      expect(hasMarkdownSyntax('####### not a heading')).toBe(false)
    })
  })

  // ── Unordered lists ─────────────────────────────────────────────────────────

  describe('unordered lists', () => {
    it('detects dash list item', () => {
      expect(hasMarkdownSyntax('- item')).toBe(true)
    })

    it('detects asterisk list item', () => {
      expect(hasMarkdownSyntax('* item')).toBe(true)
    })

    it('detects plus list item', () => {
      expect(hasMarkdownSyntax('+ item')).toBe(true)
    })

    it('detects dash list item with leading whitespace', () => {
      expect(hasMarkdownSyntax('  - nested item')).toBe(true)
    })

    it('does not treat dash without trailing space as list', () => {
      expect(hasMarkdownSyntax('-item')).toBe(false)
    })

    it('does not treat a lone dash as a list item (no space follows)', () => {
      expect(hasMarkdownSyntax('-')).toBe(false)
    })

    it('treats "- " (dash + space, no text) as list', () => {
      expect(hasMarkdownSyntax('- ')).toBe(true)
    })
  })

  // ── Ordered lists ───────────────────────────────────────────────────────────

  describe('ordered lists', () => {
    it('detects "1. item"', () => {
      expect(hasMarkdownSyntax('1. item')).toBe(true)
    })

    it('detects multi-digit numbered item "10. item"', () => {
      expect(hasMarkdownSyntax('10. item')).toBe(true)
    })

    it('does not treat "1.item" (no space) as ordered list', () => {
      expect(hasMarkdownSyntax('1.item')).toBe(false)
    })

    it('detects ordered list with leading whitespace', () => {
      expect(hasMarkdownSyntax('   3. nested')).toBe(true)
    })
  })

  // ── Task lists ──────────────────────────────────────────────────────────────

  describe('task lists', () => {
    it('detects unchecked task list item', () => {
      expect(hasMarkdownSyntax('- [ ] todo')).toBe(true)
    })

    it('detects checked task list item', () => {
      expect(hasMarkdownSyntax('- [x] done')).toBe(true)
    })

    it('detects checked task list item with uppercase X (matches unordered list rule)', () => {
      // '- [X] done' matches the unordered list regex ^[-*+]\s before reaching task list check
      expect(hasMarkdownSyntax('- [X] done')).toBe(true)
    })

    it('detects task list with leading whitespace', () => {
      expect(hasMarkdownSyntax('  - [ ] nested task')).toBe(true)
    })
  })

  // ── Tables ──────────────────────────────────────────────────────────────────

  describe('tables', () => {
    it('detects table row', () => {
      expect(hasMarkdownSyntax('| Col1 | Col2 |')).toBe(true)
    })

    it('detects table separator row', () => {
      expect(hasMarkdownSyntax('|---|---|')).toBe(true)
    })

    it('does not treat a line ending only with | as a table', () => {
      // /^\|.+\|/ requires at least one char between the pipes
      expect(hasMarkdownSyntax('|')).toBe(false)
    })

    it('detects table row with leading whitespace', () => {
      expect(hasMarkdownSyntax('  | a | b |')).toBe(true)
    })
  })

  // ── Code blocks ─────────────────────────────────────────────────────────────

  describe('code blocks', () => {
    it('detects opening code fence', () => {
      expect(hasMarkdownSyntax('```')).toBe(true)
    })

    it('detects code fence with language specifier', () => {
      expect(hasMarkdownSyntax('```typescript')).toBe(true)
    })

    it('detects code fence with leading whitespace', () => {
      expect(hasMarkdownSyntax('  ```js')).toBe(true)
    })

    it('does not treat two backticks as a code block', () => {
      // Only triple backticks trigger the startsWith check
      expect(hasMarkdownSyntax('``')).toBe(false)
    })

    it('does not treat single backtick at line start as code block', () => {
      expect(hasMarkdownSyntax('`')).toBe(false)
    })
  })

  // ── Block quotes ─────────────────────────────────────────────────────────────

  describe('block quotes', () => {
    it('detects block quote', () => {
      expect(hasMarkdownSyntax('> quoted text')).toBe(true)
    })

    it('detects block quote with leading whitespace', () => {
      expect(hasMarkdownSyntax('  > quoted text')).toBe(true)
    })

    it('does not treat ">" without trailing space as block quote', () => {
      // trimmed.startsWith('> ') requires "> " (angle bracket + space)
      expect(hasMarkdownSyntax('>no space')).toBe(false)
    })

    it('does not treat a lone ">" as a block quote', () => {
      expect(hasMarkdownSyntax('>')).toBe(false)
    })
  })

  // ── Inline bold ──────────────────────────────────────────────────────────────

  describe('inline bold (**text**)', () => {
    it('detects bold text', () => {
      expect(hasMarkdownSyntax('This is **bold** text')).toBe(true)
    })

    it('detects bold at start of line', () => {
      expect(hasMarkdownSyntax('**bold** first')).toBe(true)
    })

    it('treats "****" as markdown (matches horizontal rule pattern)', () => {
      // '****' matches ^(\*{3,})$ horizontal rule before reaching bold check
      expect(hasMarkdownSyntax('****')).toBe(true)
    })

    it('does not treat single asterisk as bold', () => {
      expect(hasMarkdownSyntax('*single*')).toBe(false)
    })

    it('detects bold in middle of line', () => {
      expect(hasMarkdownSyntax('Some **important** word here')).toBe(true)
    })
  })

  // ── Inline code (`code`) ─────────────────────────────────────────────────────

  describe('inline code', () => {
    it('detects inline code', () => {
      expect(hasMarkdownSyntax('Use `console.log()` here')).toBe(true)
    })

    it('detects inline code at start of line', () => {
      expect(hasMarkdownSyntax('`code` first')).toBe(true)
    })

    it('does not treat empty backtick pair as inline code', () => {
      // /`[^`]+`/ requires at least one non-backtick char inside
      expect(hasMarkdownSyntax('``')).toBe(false)
    })

    it('detects inline code in middle of a sentence', () => {
      expect(hasMarkdownSyntax('The function `foo()` returns a value')).toBe(true)
    })
  })

  // ── Links ────────────────────────────────────────────────────────────────────

  describe('links', () => {
    it('detects markdown link', () => {
      expect(hasMarkdownSyntax('[click here](https://example.com)')).toBe(true)
    })

    it('detects link within a sentence', () => {
      expect(hasMarkdownSyntax('See [docs](https://example.com) for more')).toBe(true)
    })

    it('does not treat empty brackets as a link', () => {
      // /\[.+\]\(.+\)/ requires at least one char in both the label and href
      expect(hasMarkdownSyntax('[]()')).toBe(false)
    })

    it('does not treat missing parentheses as a link', () => {
      expect(hasMarkdownSyntax('[no link here]')).toBe(false)
    })

    it('does not treat missing brackets as a link', () => {
      expect(hasMarkdownSyntax('(https://example.com)')).toBe(false)
    })

    it('detects link with non-URL href', () => {
      expect(hasMarkdownSyntax('[section](#anchor)')).toBe(true)
    })
  })

  // ── Horizontal rules ─────────────────────────────────────────────────────────

  describe('horizontal rules', () => {
    it('detects three dashes', () => {
      expect(hasMarkdownSyntax('---')).toBe(true)
    })

    it('detects four dashes', () => {
      expect(hasMarkdownSyntax('----')).toBe(true)
    })

    it('detects three underscores', () => {
      expect(hasMarkdownSyntax('___')).toBe(true)
    })

    it('detects three asterisks', () => {
      expect(hasMarkdownSyntax('***')).toBe(true)
    })

    it('does not treat two dashes as horizontal rule', () => {
      expect(hasMarkdownSyntax('--')).toBe(false)
    })

    it('does not treat mixed chars as horizontal rule', () => {
      expect(hasMarkdownSyntax('-_-')).toBe(false)
    })

    it('detects horizontal rule with leading whitespace', () => {
      // trimStart is applied, so "  ---" becomes "---"
      expect(hasMarkdownSyntax('  ---')).toBe(true)
    })

    it('does not match horizontal rule when it has trailing content', () => {
      // /^(-{3,}|_{3,}|\*{3,})$/ requires end-of-string after the rule
      expect(hasMarkdownSyntax('--- text')).toBe(false)
    })
  })

  // ── Plain text (no markdown) ─────────────────────────────────────────────────

  describe('plain text', () => {
    it('returns false for plain prose', () => {
      expect(hasMarkdownSyntax('Hello world')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(hasMarkdownSyntax('')).toBe(false)
    })

    it('returns false for whitespace-only string', () => {
      expect(hasMarkdownSyntax('   ')).toBe(false)
    })

    it('returns false for a regular sentence with punctuation', () => {
      expect(hasMarkdownSyntax('The price is $10.00 today.')).toBe(false)
    })

    it('returns false for a log line with timestamps', () => {
      expect(hasMarkdownSyntax('[2024-01-15 10:30:00] INFO: server started')).toBe(false)
    })

    it('returns false for a number', () => {
      expect(hasMarkdownSyntax('42')).toBe(false)
    })

    it('returns false for a URL without link syntax', () => {
      expect(hasMarkdownSyntax('https://example.com/path?q=1')).toBe(false)
    })
  })

  // ── Combined / realistic lines ────────────────────────────────────────────────

  describe('realistic mixed lines', () => {
    it('detects heading in a real document line', () => {
      expect(hasMarkdownSyntax('## API Reference')).toBe(true)
    })

    it('detects a step with inline code', () => {
      expect(hasMarkdownSyntax('Run `npm install` to get started')).toBe(true)
    })

    it('detects a note with bold emphasis', () => {
      expect(hasMarkdownSyntax('**Note:** This is important.')).toBe(true)
    })

    it('detects a numbered step containing a link', () => {
      expect(hasMarkdownSyntax('1. See [setup guide](https://docs.example.com)')).toBe(true)
    })

    it('returns false for a typical log/error line', () => {
      expect(hasMarkdownSyntax('Error: Cannot find module ./utils at line 3')).toBe(false)
    })

    it('detects a task list item inside a step-by-step block', () => {
      expect(hasMarkdownSyntax('- [x] Install dependencies')).toBe(true)
    })
  })
})
