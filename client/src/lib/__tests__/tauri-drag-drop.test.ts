import { describe, expect, it } from 'vitest'
import { isDropPositionInsideRect } from '../tauri-drag-drop'

const rect = {
  left: 500,
  right: 900,
  top: 400,
  bottom: 800,
} as DOMRect

describe('tauri-drag-drop', () => {
  it('accepts positions that are already in logical CSS pixels', () => {
    expect(isDropPositionInsideRect({ x: 650, y: 600 }, rect, 2)).toBe(true)
  })

  it('accepts positions reported in physical pixels', () => {
    expect(isDropPositionInsideRect({ x: 1300, y: 1200 }, rect, 2)).toBe(true)
  })

  it('rejects positions outside the viewport in either coordinate space', () => {
    expect(isDropPositionInsideRect({ x: 100, y: 100 }, rect, 2)).toBe(false)
  })
})
