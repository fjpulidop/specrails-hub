import { describe, it, expect } from 'vitest'
import { classifyIntent } from './intent-router'

describe('classifyIntent', () => {
  it.each([
    'cómo va el proyecto',
    'resumen de hoy',
    'how is the project',
    "what's the status",
    'qué hicimos esta semana',
    'qué tickets están atascados',
  ])('routes %s to status', (q) => {
    expect(classifyIntent(q)).toBe('status')
  })

  it.each([
    'por qué añadimos OAuth',
    'why did we pick passport',
    'qué decisión tomó el architect',
  ])('routes %s to decision', (q) => {
    expect(classifyIntent(q)).toBe('decision')
  })

  it.each([
    'Opus vs Sonnet',
    'comparado con la semana pasada',
    'evolución del coste',
  ])('routes %s to compare', (q) => {
    expect(classifyIntent(q)).toBe('compare')
  })

  it('defaults to factual when no heuristic matches', () => {
    expect(classifyIntent('tell me about OAuth')).toBe('factual')
    expect(classifyIntent('server/db.ts')).toBe('factual')
  })

  it('returns search for empty query', () => {
    expect(classifyIntent('')).toBe('search')
    expect(classifyIntent('   ')).toBe('search')
  })

  it.each([
    ['atascados', 'status'],
    ['stalled', 'status'],
    ['evolución del coste', 'compare'],
    ['why did we', 'decision'],
    ['elegimos passport', 'decision'],
    ['optamos por X', 'decision'],
  ])('classifies %s as %s', (q, expected) => {
    expect(classifyIntent(q)).toBe(expected)
  })
})
