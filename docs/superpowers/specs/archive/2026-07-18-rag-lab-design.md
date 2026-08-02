> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-raglab-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# RAG Lab — Retrieval Evaluation Playground — Design

**Date:** 2026-07-18
**One-liner:** Upload a document, define a question set, and benchmark chunking, embedding, and retrieval configurations side-by-side with real metrics — then share the results as a permalink.

## Why it's notable

Everyone ships RAG; almost nobody shows *measurement*. RAG Lab is the practitioner-credibility piece: it makes the invisible engineering choices (chunk size, overlap, strategy, model, top-k) visible and quantified, produces shareable benchmark permalinks (the kind of artifact the AI-engineering community actually passes around), and doubles as the evaluation harness for ReadLLM v2's own defaults — a documented feedback loop between two portfolio projects.

## Goals

1. Doc + question set + config matrix in → per-config metrics out, side-by-side.
2. **Phase 1 measures retrieval only** (objective, cheap, fast): hit@k and MRR against labeled gold passages. Phase 2 adds generation metrics (faithfulness/citation precision via LLM judge), which are subjective and expensive — deliberately second.
3. LLM-assisted question-set creation: suggested Q→gold-passage pairs the user confirms or edits (labeling is the real bottleneck; the tool must lower it).
4. Every run permalinked and reproducible: config, doc fingerprint, question set, and results stored and viewable by anyone with the link.
5. Pre-run cost estimate (token math shown before spending) — the feature that signals the author thinks in production terms.

## Non-goals

- Being a hosted eval service for arbitrary scale — docs capped (≈100 pages), configs per run capped (≈12 combinations).
- Fine-tuned or local embedding models (API models only in v1).
- Agentic/multi-hop retrieval evaluation (single-query retrieval only).
- Reranker comparison in v1 (phase 2 candidate alongside hybrid/BM25).

## Architecture

Client-heavy, reusing ReadLLM's proven modules:

```
Vite + React + TS SPA (Vercel)
  ├─ pdf.js extract (shared lineage with ReadLLM) → full text, page map
  ├─ Chunkers run IN BROWSER (pure TS, unit-testable):
  │    fixed-size · sentence-window · recursive (paragraph→sentence) — each × size × overlap
  ├─ Question-set builder: LLM-suggested Q + gold passage spans → user confirms/edits
  ├─ Run engine (client-orchestrated):
  │    per config: embed chunks + questions → cosine top-k → hit@k / MRR vs gold spans
  └─ fetch → Supabase Edge Function `embed` (batch, rate-limited proxy)
        Supabase: experiments · runs · results tables (+ doc text in storage) for permalinks
```

- **Gold labeling model:** a gold answer is a character-span in the document; a retrieved chunk "hits" if it overlaps the gold span by a threshold (default ≥50% of the span). This keeps metrics well-defined across *different* chunkings of the same text — the core design problem of the tool, solved structurally.
- **Embedding models compared in v1:** `text-embedding-3-small` vs `text-embedding-3-large` (both proxied). The matrix is (chunker × size × overlap × model × k), user-selected within the combination cap.
- **Results UI:** ranked config leaderboard, metric table, one Vega-Lite chart (metric vs chunk size, grouped by strategy), and a per-question drill-down showing *which* configs missed it and what they retrieved instead — the diagnostic view that teaches, not just scores.
- **Embedding cache** keyed by (doc fingerprint, chunker, params, model) so re-runs and shared-doc experiments cost nothing after the first run.

## Core flows

- **Sample-first onboarding:** bundled public-domain doc + curated 15-question gold set → visitor hits "Run benchmark" and sees a full comparison in ~a minute with zero setup. This is what the AI-tab card links to.
- **Own-doc flow:** upload → extract → question builder (LLM suggests 10, user edits/approves, min 5 to run) → pick configs → cost estimate → run (progress per config) → results + permalink.
- **ReadLLM synergy flow (documented in README):** run ReadLLM's current chunking (1600/320 fixed) against alternatives on a representative doc; adopt the winner as ReadLLM's defaults, linking the permalink as evidence.

## Security, cost & abuse controls

- The `embed` proxy is the only spend surface: per-IP daily embedding-token budget, batch size caps, and the combination cap keep a max run bounded (~a few cents); global daily cap alarms.
- Phase 2's LLM-judge runs get their own tighter caps (generation is 10–100× embedding cost).
- Uploaded docs are stored (needed for permalinks/drill-down) with a visible note; a "don't store — local session only" toggle runs without persistence and produces no permalink. No accounts; deletion by run-owner token kept in localStorage.

## Portfolio integration

- Repo `rag-lab` (public), live at rag-lab.vercel.app. Card copy: "Which chunking actually wins? Benchmarks, not vibes."
- The sample benchmark permalink is the shareable artifact for the AI-eng community; README includes the ReadLLM case study.

## Delivery phases

1. **Phase 1 (single implementation plan):** extract → 3 chunkers → question builder with gold spans → run engine + hit@k/MRR → results UI + permalinks + cache + sample doc.
2. **Phase 2:** generation metrics (faithfulness, citation precision via LLM judge with rubric), BM25/hybrid baseline, reranker option, export results as CSV/markdown table.

## Success criteria

- The sample benchmark completes in <90s cold and produces a defensible winner with visible per-question diagnostics.
- Metrics are deterministic: re-running an identical config reproduces identical scores (embedding cache makes this exact).
- The chunk-overlap hit-attribution logic is unit-tested against handcrafted fixtures (spans at chunk boundaries, spans larger than chunks, multi-hit questions).
- One published permalink demonstrably changes ReadLLM v2's default settings (the feedback-loop story is real, not aspirational).

## Decisions taken (override if you disagree)

- Name **RAG Lab**; retrieval-first scoping (generation judging deferred to phase 2).
- Span-overlap gold model with 50% threshold; 3 chunker families in v1; OpenAI embedding pair only.
- Client-side chunking/orchestration, proxy-side embedding, Supabase persistence for permalinks.

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`. One assumption in this spec would have
taken down the shared database; the rest holds.

## The spec-breaker: the embedding cache cannot live server-side

The spec calls for "an embedding cache keyed by (doc fingerprint, chunker, params, model) so
re-runs and shared-doc experiments cost nothing after the first run." Under a dedicated Supabase
project that was fine. Under the shared 500 MB database it is fatal.

A single 12-config run over a 100-page document produces roughly 3,600 embeddings. At 1024
dimensions stored as `halfvec` that is about 11 MB — so **45 benchmark runs would consume the
entire database that all seven apps share.**

Revised: **the embedding cache moves to IndexedDB in the browser.** The server persists only what
a permalink needs — configuration, question set, gold spans, and computed metrics. Vectors are
never stored server-side.

This costs cross-visitor cache sharing: two different people benchmarking the same document each
pay the embedding cost once. Given embeddings are now free via Workers AI, that cost is Neurons
rather than dollars, and the determinism guarantee is unaffected because identical inputs
reproduce identical vectors.

## Embeddings: the model comparison survives, differently

OpenRouter has **no embeddings endpoint**, so the specced `text-embedding-3-small` versus
`text-embedding-3-large` comparison cannot run through it. Workers AI provides the replacement
and arguably a better experiment: compare **`@cf/baai/bge-m3` (multilingual) against the
English-specialized BGE family**. Multilingual-versus-specialized is a more interesting axis than
small-versus-large from one vendor, and every model in it is free.

## The new binding constraint is Neurons, not dollars

Workers AI allows **10,000 Neurons per day**, reset at 00:00 UTC. A 12-config benchmark embeds
thousands of chunks, so the daily allowance — not cost — is what caps runs.

The spec already required a pre-run cost estimate, which was one of its better ideas. That
estimate becomes a **Neuron estimate against the remaining daily budget**, shown before the run
commits. The per-1k-token Neuron cost of bge-m3 must be measured on first use; the platform spec
records this as an open measurement with OpenAI embeddings at $0.02/1M as the fallback if the
allowance proves too tight.

Quotas: 2 runs/day anonymous, 10/day linked.

## Other changes

- **Hosting:** `labs.abdash.net/raglab`.
- **Chunkers** come from `packages/doc-core`, shared with Recto and GraphRead — the "shared
  lineage with ReadLLM" the spec describes becomes an actual import.
- **Budget:** 30 MB Postgres for configs and metrics, 50 MB Storage for document text.
- **Deletion** by owner token in localStorage is replaced by ownership through anonymous auth,
  which is strictly better and one less mechanism.

## Unchanged

The span-overlap gold model with its 50% threshold — the structural solution to comparing metrics
across different chunkings — is the intellectual core of this project and is untouched. So are
the three chunker families, hit@k and MRR, the per-question drill-down, the sample-first
onboarding, and the deferral of generation metrics to phase 2. The ReadLLM feedback loop now
points at Recto, whose defaults it will set.
