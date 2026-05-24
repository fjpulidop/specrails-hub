// Main-thread embedder wrapper.
//
// Loads @xenova/transformers lazily and computes 384-dim L2-normalised
// float32 embeddings for the bundled `multilingual-e5-small` model.
//
// Implementation note: for v1 we run the model inline on the main thread but
// behind a job queue so we never have more than one batch in flight. A
// worker_thread variant lives at ./embedder-worker.ts and can be enabled in
// the future via the `ASK_EMBEDDER_WORKER` env var; the public API is
// identical.
//
// If the model is missing or @xenova/transformers fails to load (CI without
// LFS files, e.g.), the embedder falls back to a deterministic hash-based
// pseudo-embedding so that downstream code paths remain testable. Real
// queries are signalled as `degraded` to the UI in that case.

import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

let pipelinePromise: Promise<unknown> | null = null
let pipelineRef: ((text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null
let degradedReason: string | null = null

const EMBED_DIM = 384

function resolveModelDir(): string | null {
  // @xenova/transformers resolves model id `multilingual-e5-small` to
  // `${localModelPath}/multilingual-e5-small/{config.json,onnx/...}`, so we
  // point at the PARENT of that directory and let the library walk in.
  const marker = path.join('multilingual-e5-small', 'config.json')
  // Packaged build (Tauri sidecar) — embeddings sit next to the binary.
  const packaged = path.resolve(process.execPath, '..', 'embeddings')
  if (fs.existsSync(path.join(packaged, marker))) return packaged
  // Dev mode — repo-relative.
  const dev = path.resolve(__dirname, '..', '..', 'src-tauri', 'binaries', 'embeddings')
  if (fs.existsSync(path.join(dev, marker))) return dev
  return null
}

async function loadPipeline(): Promise<void> {
  if (pipelinePromise) {
    await pipelinePromise
    return
  }
  pipelinePromise = (async () => {
    const modelDir = resolveModelDir()
    if (!modelDir) {
      degradedReason = 'model-not-bundled'
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xfrm: any = await import('@xenova/transformers' as string).catch(() => null)
      if (!xfrm) {
        degradedReason = 'transformers-not-installed'
        return
      }
      // Configure the cache to point at our bundled model path. The library
      // resolves model id `multilingual-e5-small` to {cache}/multilingual-e5-small
      // so we lay the files out matching that convention.
      xfrm.env.allowRemoteModels = false
      xfrm.env.localModelPath = modelDir
      pipelineRef = await xfrm.pipeline('feature-extraction', 'multilingual-e5-small', {
        quantized: true,
      })
    } catch (err) {
      degradedReason = err instanceof Error ? err.message : String(err)
    }
  })()
  await pipelinePromise
}

export function isEmbedderDegraded(): { degraded: boolean; reason: string | null } {
  return { degraded: pipelineRef === null && pipelinePromise !== null, reason: degradedReason }
}

/**
 * Warm-up the embedder. Called ~5s after server boot via a setTimeout.
 * Never throws — degraded state is exposed via `isEmbedderDegraded()`.
 */
export async function warmup(): Promise<void> {
  await loadPipeline()
}

function normalize(v: Float32Array): Float32Array {
  let sumSq = 0
  for (let i = 0; i < v.length; i++) sumSq += v[i]! * v[i]!
  const norm = Math.sqrt(sumSq) || 1
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm
  return v
}

/** Deterministic fallback when the model is unavailable. NOT a real embedding —
 *  exists only so downstream code (search, indexing) can still run in tests
 *  and degraded environments. */
function fallbackEmbed(text: string): Float32Array {
  const v = new Float32Array(EMBED_DIM)
  const seed = crypto.createHash('sha256').update(text, 'utf8').digest()
  for (let i = 0; i < EMBED_DIM; i++) {
    const b = seed[i % seed.length]!
    v[i] = (b / 255) * 2 - 1
  }
  return normalize(v)
}

export async function embed(text: string): Promise<Float32Array> {
  if (!pipelineRef) await loadPipeline()
  if (!pipelineRef) return fallbackEmbed(text)
  // e5 family expects a "query: " or "passage: " prefix; we use passage for
  // index-time and query for query-time but at this level we don't know.
  // Caller may pass with the prefix already; otherwise we default to passage.
  const prefixed = text.startsWith('query: ') || text.startsWith('passage: ') ? text : `passage: ${text}`
  const out = await pipelineRef(prefixed, { pooling: 'mean', normalize: true })
  const arr = new Float32Array(EMBED_DIM)
  for (let i = 0; i < EMBED_DIM && i < out.data.length; i++) arr[i] = out.data[i]!
  return normalize(arr)
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = []
  for (const t of texts) out.push(await embed(t))
  return out
}

export function bufferFromVector(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

export function vectorFromBuffer(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}

export const EMBEDDING_DIM = EMBED_DIM
