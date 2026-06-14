import { describe, it, expect, vi } from 'vitest'
import { isExemptFromContextMenuSuppression, suppressNativeContextMenu } from '../useSuppressNativeContextMenu'

function build(html: string, query: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  const el = host.querySelector(query)
  if (!el) throw new Error(`not found: ${query} in ${html}`)
  return el
}

const EXEMPT: Array<[string, string]> = [
  ['<input id="t" />', '#t'],
  ['<textarea id="t"></textarea>', '#t'],
  ['<select id="t"></select>', '#t'],
  ['<div contenteditable="true" id="t"></div>', '#t'],
  ['<div contenteditable="" id="t"></div>', '#t'],
  ['<div class="monaco-editor"><span id="t">x</span></div>', '#t'],
  ['<div class="xterm"><span id="t">x</span></div>', '#t'],
  ['<div data-native-menu><span id="t">x</span></div>', '#t'],
]

describe('isExemptFromContextMenuSuppression', () => {
  for (const [html, query] of EXEMPT) {
    it(`is exempt: ${html}`, () => {
      expect(isExemptFromContextMenuSuppression(build(html, query))).toBe(true)
    })
  }

  it('is NOT exempt for a plain div / button / card', () => {
    expect(isExemptFromContextMenuSuppression(build('<div id="t"></div>', '#t'))).toBe(false)
    expect(isExemptFromContextMenuSuppression(build('<button id="t"></button>', '#t'))).toBe(false)
    expect(isExemptFromContextMenuSuppression(build('<div class="card"><p id="t">x</p></div>', '#t'))).toBe(false)
  })

  it('is NOT exempt for null / non-Element targets', () => {
    expect(isExemptFromContextMenuSuppression(null)).toBe(false)
    expect(isExemptFromContextMenuSuppression(window as unknown as EventTarget)).toBe(false)
  })
})

describe('suppressNativeContextMenu', () => {
  it('preventDefaults on a plain (non-exempt) target', () => {
    const target = build('<div id="t"></div>', '#t')
    const preventDefault = vi.fn()
    suppressNativeContextMenu({ target, preventDefault } as unknown as MouseEvent)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves the native menu on an exempt target (textarea)', () => {
    const target = build('<textarea id="t"></textarea>', '#t')
    const preventDefault = vi.fn()
    suppressNativeContextMenu({ target, preventDefault } as unknown as MouseEvent)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
