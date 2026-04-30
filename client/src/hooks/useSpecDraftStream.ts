import { useCallback, useEffect, useRef, useState } from 'react'
import { useSharedWebSocket } from './useSharedWebSocket'
import {
  SPEC_DRAFT_DEFAULTS,
  SPEC_DRAFT_FIELDS,
  isSpecDraftUpdate,
  type SpecDraft,
  type SpecDraftField,
} from '../lib/spec-draft'

export interface UseSpecDraftStreamResult {
  draft: SpecDraft
  ready: boolean
  chips: string[]
  /** Field keys that changed in the most recent Claude-driven merge (for flash animation). */
  lastChangedFields: SpecDraftField[]
  /** True while the user is mid-typing in the composer between turns. */
  hasManualOverrides: boolean
  /** Apply a manual user edit to a single field. Records the field as overridden. */
  setField: <K extends SpecDraftField>(key: K, value: SpecDraft[K]) => void
  /** Called when the user sends a message — clears manual override tracking so the next Claude turn is authoritative. */
  clearManualOverrides: () => void
}

export function useSpecDraftStream(conversationId: string | null): UseSpecDraftStreamResult {
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const [draft, setDraft] = useState<SpecDraft>(SPEC_DRAFT_DEFAULTS)
  const [ready, setReady] = useState(false)
  const [chips, setChips] = useState<string[]>([])
  const [lastChangedFields, setLastChangedFields] = useState<SpecDraftField[]>([])
  const manualFieldsRef = useRef<Set<SpecDraftField>>(new Set())
  const [hasManualOverrides, setHasManualOverrides] = useState(false)

  // Reset state when conversation changes
  useEffect(() => {
    setDraft(SPEC_DRAFT_DEFAULTS)
    setReady(false)
    setChips([])
    setLastChangedFields([])
    manualFieldsRef.current = new Set()
    setHasManualOverrides(false)
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    const handlerId = `spec-draft-stream:${conversationId}`
    registerHandler(handlerId, (msg) => {
      if (!isSpecDraftUpdate(msg)) return
      if (msg.conversationId !== conversationId) return

      const manual = manualFieldsRef.current
      const changedThisTurn: SpecDraftField[] = []

      setDraft((prev) => {
        const next: SpecDraft = { ...prev }
        for (const key of SPEC_DRAFT_FIELDS) {
          if (manual.has(key)) continue
          const incoming = (msg.draft as Partial<SpecDraft>)[key]
          if (incoming === undefined) continue
          // Only mark as changed if the value differs.
          const changed = !shallowEqualField(next[key], incoming)
          ;(next as unknown as Record<SpecDraftField, unknown>)[key] = incoming
          if (changed) changedThisTurn.push(key)
        }
        return next
      })

      setReady(msg.ready)
      setChips(msg.chips.slice(0, 3))
      setLastChangedFields(changedThisTurn)
    })
    return () => unregisterHandler(handlerId)
  }, [conversationId, registerHandler, unregisterHandler])

  const setField: UseSpecDraftStreamResult['setField'] = useCallback((key, value) => {
    manualFieldsRef.current.add(key)
    setHasManualOverrides(true)
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const clearManualOverrides = useCallback(() => {
    if (manualFieldsRef.current.size === 0) return
    manualFieldsRef.current = new Set()
    setHasManualOverrides(false)
  }, [])

  return {
    draft,
    ready,
    chips,
    lastChangedFields,
    hasManualOverrides,
    setField,
    clearManualOverrides,
  }
}

function shallowEqualField(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }
  return false
}
