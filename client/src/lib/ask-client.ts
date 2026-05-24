// Client-side helpers for Ask-the-Hub.
//
// Search: simple fetch returning grouped sources.
// Query: SSE streamed via fetch body reader (works in Tauri webview).

import { getApiBase } from './api'

export interface AskSource {
  n?: number
  rowid?: number
  kind: 'ticket' | 'explore-turn' | 'job' | 'file-summary' | 'git-commit'
  source_id: string
  title: string
  ticket_id?: string | null
  job_id?: string | null
  conversation_id?: string | null
  file_path?: string | null
  score?: number
  body?: string
  ts?: number
}

export async function askSearch(query: string, signal?: AbortSignal): Promise<AskSource[]> {
  const url = `${getApiBase()}/ask/search?q=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`ask_search_${res.status}`)
  const data = (await res.json()) as { results: AskSource[] }
  return data.results
}

export interface AskIndexStatus { total: number; byKind: Record<string, number> }

export async function askIndexStatus(): Promise<AskIndexStatus> {
  const res = await fetch(`${getApiBase()}/ask/index/status`)
  if (!res.ok) throw new Error(`ask_index_status_${res.status}`)
  return (await res.json()) as AskIndexStatus
}

export async function askIndexRebuild(): Promise<void> {
  const res = await fetch(`${getApiBase()}/ask/index/rebuild`, { method: 'POST' })
  if (!res.ok) throw new Error(`ask_rebuild_${res.status}`)
}

export interface AskProvidersInfo {
  detected: { providers: Array<{ id: string; displayName: string; available: boolean; executable: boolean }>; usable: string[] }
  setting: 'claude' | 'codex' | 'none' | null
  resolution:
    | { mode: 'use'; provider: string }
    | { mode: 'none' }
    | { mode: 'degraded'; configured: string }
    | { mode: 'first-run'; options: string[] }
}

export async function askProviders(): Promise<AskProvidersInfo> {
  const res = await fetch(`${getApiBase()}/ask/providers`)
  if (!res.ok) throw new Error(`ask_providers_${res.status}`)
  return (await res.json()) as AskProvidersInfo
}

export type AskStreamEvent =
  | { type: 'sources'; intent: string; sources: AskSource[] }
  | { type: 'thinking' }
  | { type: 'token'; text: string }
  | { type: 'citation'; citations: Array<{ n: number; sourceIdx: number }> }
  | { type: 'followups'; items: string[] }
  | { type: 'invocation'; model: string; cost?: number; turns?: number; durationMs?: number }
  | { type: 'degraded'; reason: string }
  | { type: 'error'; reason: string; [k: string]: unknown }
  | { type: 'done'; status?: string }

export interface AskPreviousTurn { question: string; answer: string }

export async function askQuery(
  question: string,
  onEvent: (e: AskStreamEvent) => void,
  signal?: AbortSignal,
  previousTurns?: AskPreviousTurn[],
): Promise<void> {
  const res = await fetch(`${getApiBase()}/ask/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, previousTurns: previousTurns ?? [] }),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`ask_query_${res.status}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder('utf-8')
  let buffer = ''
  let currentEvent = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          onEvent({ type: currentEvent as AskStreamEvent['type'], ...data } as AskStreamEvent)
        } catch {
          // skip malformed frame
        }
      }
    }
  }
}
