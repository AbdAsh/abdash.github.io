# RAG Lab — Retrieval Evaluation Playground — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-rag-lab-design.md`
**Depends on:** `2026-08-01-platform-design.md`
**One-liner:** Upload a document, define a question set, and benchmark chunking, embedding, and
retrieval configurations side-by-side with real metrics — then share the results as a permalink.

## Why it's notable

Everyone ships RAG; almost nobody shows *measurement*. RAG Lab is the practitioner-credibility
piece. It makes invisible engineering choices — chunk size, overlap, strategy, model, top-k —
visible and quantified, produces shareable benchmark permalinks of the kind the AI-engineering
community actually passes around, and doubles as the evaluation harness for Recto's own defaults.
That feedback loop between two portfolio projects is documented and real.

## The correction that mattered

The July spec called for "an embedding cache keyed by (doc fingerprint, chunker, params, model)
so re-runs and shared-doc experiments cost nothing after the first run." Under a dedicated
Supabase project that was fine. Under the shared 500 MB database it was fatal.

A single twelve-config run over a hundred-page document produces roughly 3,600 embeddings. At
1536 dimensions stored as `halfvec` that is about 11 MB — so **45 benchmark runs would have
consumed the entire database that all seven apps share.**

**The embedding cache lives in IndexedDB, in the browser.** The server persists only what a
permalink needs: configuration, question set, gold spans, and computed metrics. Vectors are never
stored server-side.

The cost is cross-visitor cache sharing — two people benchmarking the same document each pay the
embedding cost once. At $0.02 per million tokens that is a rounding error, and the determinism
guarantee is unaffected, since identical inputs reproduce identical vectors.

## Goals

1. Document plus question set plus config matrix in → per-config metrics out, side by side.
2. **Phase 1 measures retrieval only** — objective, cheap, fast: hit@k and MRR against labeled
   gold passages. Phase 2 adds generation metrics via LLM judge, which are subjective and
   expensive, and are deliberately second.
3. LLM-assisted question-set creation: suggested question→gold-passage pairs the user confirms or
   edits. Labeling is the real bottleneck and the tool must lower it.
4. Every run permalinked and reproducible: config, document fingerprint, question set, and
   results viewable by anyone with the link.
5. A pre-run cost estimate — token math shown before spending, the feature that signals the
   author thinks in production terms.

## Non-goals

- A hosted eval service at arbitrary scale. Documents capped near 100 pages, configs per run
  capped near 12 combinations.
- Fine-tuned or local embedding models. API models only in v1.
- Agentic or multi-hop retrieval. Single-query retrieval only.
- Reranker comparison in v1 — a phase 2 candidate alongside hybrid/BM25.

## Architecture

```
Vite + React + TS SPA → Cloudflare Pages at labs.abdash.net/raglab
  ├─ packages/doc-core: pdf.js extract → full text + page map
  ├─ Chunkers run IN BROWSER (pure TS, unit-tested):
  │     fixed-size · sentence-window · recursive (paragraph→sentence), each × size × overlap
  ├─ Question-set builder: LLM-suggested Q + gold passage spans → user confirms/edits
  ├─ Run engine, client-orchestrated:
  │     per config → embed chunks + questions → cosine top-k → hit@k / MRR vs gold spans
  ├─ IndexedDB embedding cache, keyed by (fingerprint, chunker, params, model)
  └─ fetch → Supabase Edge Function `raglab-embed`  (batch OpenAI proxy, quota-checked)
        Supabase: raglab.experiments · runs · results  (+ document text in Storage)
```

- **Gold labeling model:** a gold answer is a character span in the document; a retrieved chunk
  "hits" if it overlaps that span by a threshold, default 50%. This keeps metrics well-defined
  across *different* chunkings of the same text — the core design problem of the tool, solved
  structurally. It is the intellectual centre of this project and is unchanged.
- **Embedding models compared in v1:** OpenAI `text-embedding-3-small` versus
  `text-embedding-3-large`, both through the proxy. The matrix is
  (chunker × size × overlap × model × k), user-selected within the combination cap.
- **Results UI:** ranked config leaderboard, metric table, one Vega-Lite chart of metric against
  chunk size grouped by strategy, and a per-question drill-down showing *which* configs missed it
  and what they retrieved instead — the diagnostic view that teaches rather than just scores.

## Core flows

- **Sample-first onboarding:** a bundled public-domain document with a curated 15-question gold
  set. The visitor presses "Run benchmark" and sees a full comparison in about a minute with zero
  setup. This is what the AI-tab card links to.
- **Own-document flow:** upload → extract → question builder (LLM suggests 10, user edits and
  approves, minimum 5 to run) → pick configs → cost estimate → run with per-config progress →
  results and permalink.
- **Recto synergy flow, documented in the README:** run Recto's current chunking (1600/320 fixed)
  against alternatives on a representative document, then adopt the winner as Recto's default,
  citing the permalink as evidence.

## Security, cost & abuse controls

`raglab-embed` is the only spend surface. Embeddings are genuinely cheap — a full twelve-config
benchmark over a hundred-page document is roughly $0.03 — so the controls exist to bound the tail
rather than to manage a real bill: quota tiers of 2 runs a day anonymous and 10 linked via
`platform.consume_quota`, batch size caps, and the combination cap. The pre-run estimate shows
projected token count and dollar cost before the run commits.

Uploaded document text is stored, since permalinks and drill-down need it, with a visible note. A
"local session only" toggle runs without persistence and produces no permalink. Ownership comes
from the anonymous session rather than the July spec's owner-token-in-localStorage, which is
strictly better and one less mechanism to maintain.

Budget: 30 MB Postgres for configs and metrics, 50 MB Storage for document text.

## Delivery phases

1. **Phase 1** — extract → three chunker families → question builder with gold spans → run engine
   with hit@k and MRR → results UI → permalinks → IndexedDB cache → bundled sample.
2. **Phase 2** — generation metrics (faithfulness, citation precision via LLM judge with a
   rubric), BM25/hybrid baseline, reranker option, export as CSV or markdown table.

## Success criteria

- The sample benchmark completes in under 90 s cold and produces a defensible winner with visible
  per-question diagnostics.
- Metrics are deterministic: re-running an identical config reproduces identical scores, which the
  cache makes exact.
- The chunk-overlap hit-attribution logic is unit-tested against handcrafted fixtures — spans at
  chunk boundaries, spans larger than chunks, multi-hit questions.
- **One published permalink demonstrably changes Recto's default settings.** The feedback loop has
  to be real, not aspirational.
- No run writes a vector to Postgres. Verified by inspecting the schema after a full benchmark.

## Decisions taken

- Name **RAG Lab**; retrieval-first scoping, generation judging deferred to phase 2.
- Span-overlap gold model at a 50% threshold; three chunker families; the OpenAI embedding pair.
- **Embedding cache in IndexedDB, never server-side** — the correction that keeps the shared
  database alive.
- Client-side chunking and orchestration, proxy-side embedding, Supabase persistence for
  permalinks only.
