# Ask the Hub

Project-memory search and Q&A surface inside the hub. Press **⌘K** (macOS) or **Ctrl+K** (Windows/Linux) anywhere in the dashboard to open it.

## What it indexes

Per active project, Ask the Hub builds a local semantic index over:

- **Tickets** — title + description + labels + status
- **Explore conversations** — every user/assistant turn pair
- **Jobs** — command + final result + status
- **File summaries** — the plain-language summaries produced by the Code Explorer feature
- **Git commits** — subject + body, last 6 months

Nothing is indexed from your working tree directly. The index lives in the per-project SQLite at `~/.specrails/projects/<slug>/jobs.sqlite` (tables `ask_docs`, `ask_docs_fts`, `ask_query_log`). No file in the project tree is created or modified.

## Two modes

### Search-only (default when no AI CLI is configured)

Type into the modal — instant fuzzy + BM25 results across all indexed kinds. Sub-50 ms p95. No network, no AI cost.

### AI answer

Press **Enter** to ask the project a natural-language question:

- _"Why did we add OAuth?"_ → cited answer from the tickets and Explore turns that led to it
- _"How is the project going?"_ → status digest aggregated from tickets/jobs/spending
- _"Opus vs Sonnet"_ → comparison table from `ai_invocations`
- _"qué tickets están atascados?"_ → list of stale tickets with last-update timestamps

The answer LLM is your installed **Claude** or **Codex** CLI — never a direct cloud SDK and **never a new API key**. Cost lands in the normal Analytics page under a new `Ask the Hub` surface.

## Provider picker

The first time you open the modal and both Claude and Codex are detected on PATH, the modal asks which to use. Your choice persists in `hub_settings.ask_answer_provider`. Change it any time from `Settings → Ask the Hub`.

If neither CLI is installed, the modal still works as a pure-search experience. A banner suggests installing one to unlock answers.

## Privacy

- Embeddings: 100% local. The bundled `multilingual-e5-small` ONNX model ships with the desktop installer (~118 MB) and runs in-process via `@xenova/transformers`. No model file is downloaded at runtime.
- Search: 100% local. BM25 (FTS5) + cosine over in-memory vectors, no network call.
- Answer LLM: spawns the CLI you already use for everything else. Whatever auth and privacy that CLI uses, Ask uses too.

## Kill switch

Set `SPECRAILS_ASK_HUB=0` in the hub environment to disable the feature wholesale. The router returns 404 and the client modal unmounts.

## Settings

`Settings → Ask the Hub` exposes:

- **Provider** — auto / Claude / Codex / search-only
- **Answer model** — per-provider override (defaults: `claude-haiku-4-5`, `gpt-4o-mini`)
- **Reranker** — heuristic (free, default) or LLM (extra cost)
- **Monthly budget USD** — cap on `surface='ask'` spend; AI answers stop when the cap is hit
- **Auto-index on first open** — toggle the lazy backfill

A **Reindex** button rebuilds the per-project index from scratch (useful after migrating from another schema or to recover from a corrupted state).

## Indexing model

- **Lazy backfill** on first modal open — enumerates everything once, embeds in batches, broadcasts `ask.indexing` progress over WebSocket.
- **Incremental upserts** on:
  - `QueueManager` job completion → re-index touched tickets + the job itself
  - `ChatManager` explore-turn persisted → re-index the (user, assistant) pair (debounced 5 s)
  - `FileSummaryManager` summary updated → re-index that summary
- **Invalidation key**: `body_hash` (sha256 of the chunk). Unchanged hash → skip embed.
- **Cap**: 100 000 docs per project; oldest non-ticket docs are swept FIFO when exceeded.

## Build notes for contributors

The bundled embedding model is tracked via **Git LFS** under `src-tauri/binaries/embeddings/`. After cloning the repo:

```bash
git lfs install
git lfs pull
```

CI runs that only execute unit tests do not need LFS (the embedder is mocked at the module boundary). The `desktop-release` workflow does need it — its checkout step is configured with `lfs: true`.

If `src-tauri/binaries/embeddings/` is missing at runtime (CI without LFS, dev clone without LFS pull, or a partial install), the embedder degrades to a deterministic hash-based fallback. Vector search will return non-meaningful results in that mode but BM25 stays accurate — Cmd+K still works as a search box.
