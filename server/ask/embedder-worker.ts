// Worker-thread entry for the embedder. Loaded by `embedder.ts` when the
// `ASK_EMBEDDER_WORKER=1` env var is set. Keeps the inline path as default in
// v1 because @xenova/transformers in a worker brings its own complications
// (own fetch polyfill, separate cache, slower startup) — measured in dev to
// not pay back at our query rates.

import { parentPort } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'

interface RequestMessage { id: number; text: string }
interface ResponseMessage { id: number; vector?: number[]; error?: string }

let pipelineRef:
  | ((text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>)
  | null = null

async function loadPipeline(): Promise<void> {
  if (pipelineRef) return
  const marker = path.join('multilingual-e5-small', 'config.json')
  const packaged = path.resolve(process.execPath, '..', 'embeddings')
  const dev = path.resolve(__dirname, '..', '..', 'src-tauri', 'binaries', 'embeddings')
  const modelDir = fs.existsSync(path.join(packaged, marker))
    ? packaged
    : fs.existsSync(path.join(dev, marker))
      ? dev
      : null
  if (!modelDir) throw new Error('model-not-bundled')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xfrm: any = await import('@xenova/transformers' as string)
  xfrm.env.allowRemoteModels = false
  xfrm.env.localModelPath = modelDir
  pipelineRef = await xfrm.pipeline('feature-extraction', 'multilingual-e5-small', { quantized: true })
}

parentPort?.on('message', async (msg: RequestMessage) => {
  try {
    await loadPipeline()
    const out = await pipelineRef!(msg.text, { pooling: 'mean', normalize: true })
    const arr = Array.from(out.data.slice(0, 384))
    const response: ResponseMessage = { id: msg.id, vector: arr }
    parentPort?.postMessage(response)
  } catch (err) {
    const response: ResponseMessage = { id: msg.id, error: err instanceof Error ? err.message : String(err) }
    parentPort?.postMessage(response)
  }
})
