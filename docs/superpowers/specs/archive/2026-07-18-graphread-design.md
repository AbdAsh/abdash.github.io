> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-graphread-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# GraphRead — Knowledge-Graph Explorer — Design

**Date:** 2026-07-18
**One-liner:** Feed it a document; it extracts the entities and relationships and renders them as an interactive, queryable force-directed graph — every node and edge traceable back to the source passage that asserted it.

## Why it's notable

It is the visual centerpiece of the lineup: a living graph you can fly around is the screenshot that makes people click. Under the flash sits real engineering — cross-chunk entity resolution (the genuinely hard problem), provenance-preserving extraction, and WebGL graph rendering — and it plays directly to the author's frontend craft. The name and ingestion lineage tie it to ReadLLM as a family: ReadLLM answers questions about a document; GraphRead shows you its shape.

## Goals

1. PDF (or pasted text) in → entity/relation graph out, interactively explorable at 60fps for typical documents.
2. **Provenance everywhere:** click any node or edge and see the exact source passages that produced it — same citation ethic as ReadLLM.
3. Cross-chunk entity resolution: "Dr. Sarah Chen," "Chen," and "the lead researcher" merge into one node with recorded aliases.
4. Graph query in natural language ("how are X and Y connected?") answered with a highlighted path plus an LLM narration grounded in the path's evidence (phase 2).
5. Shareable graph permalinks; a preloaded demo graph so the card demo is instant.

## Non-goals

- Multi-document / corpus-level graphs in v1 (single document; phase 2).
- Ontology configuration UIs — v1 uses one fixed, general schema (see below).
- Graph editing by hand (view/explore only, plus node merge/split corrections — see flows).
- Being a GraphRAG *answering* engine — retrieval-augmented answering stays ReadLLM's job; GraphRead's phase-2 queries are about structure (paths, neighborhoods), not general Q&A.

## Architecture

```
Vite + React + TS SPA (Vercel)
  ├─ Ingestion: pdf.js extract + chunking (reused ReadLLM lineage, coarser chunks ~2500 chars)
  ├─ fetch → Supabase Edge Function `extract` (rate-limited LLM proxy)
  │     per chunk → strict JSON: entities[{name,type,description}] · relations[{source,relation,target,quote}]
  ├─ Entity resolution IN BROWSER (deterministic + cheap):
  │     pass 1: normalized-name & alias matching → pass 2: embedding similarity on
  │     name+description (via `embed` proxy) with type-compatibility gate → merge sets w/ aliases
  ├─ Graph assembly: nodes/edges with provenance (chunk ids, quotes); weights = mention counts
  └─ Rendering: react-force-graph (WebGL 2D) — size by degree, color by type,
        hover highlight, click → side panel (aliases, relations, source passages)

Supabase: graphs · nodes · edges tables + doc text in storage → permalink slugs
```

- **Fixed v1 schema:** entity types {person, organization, place, concept, event, artifact, date}; relations are free-text verb phrases normalized to lowercase ("works for", "funded by") rather than a closed set — a closed relation ontology fights real documents and delivers worse graphs than honest verb phrases.
- **Extraction contract:** every relation must carry a supporting `quote` (verbatim substring of the chunk, validated client-side against the chunk text; relations whose quote fails validation are dropped — the anti-hallucination gate).
- **Resolution correctness valve:** automatic merging will make mistakes, so the UI includes "split node" (undo a merge) and "merge nodes" (drag one onto another) — corrections stored with the graph. This converts the hardest failure mode into a feature.

## Core flows

- **Demo-first:** the AI-tab card and landing page open the preloaded demo graph (a public-domain text, e.g. a well-known novel or historical report — chosen at build time) — zero-effort wow.
- **Own doc:** upload → cost estimate (extraction is per-chunk LLM work; show it before running, cap ~60 pages) → progress as chunks extract and the graph grows live (nodes appearing over ~30–90s is itself good theater) → explore → optional permalink.
- **Explore:** search box for nodes; type filter chips; click node → panel with description, aliases, relations grouped by type, and source quotes; click edge → its quotes. Double-click isolates a node's neighborhood.
- **Query (phase 2):** NL question → shortest/strongest path(s) between resolved endpoints → path highlighted in the viz + narration generated strictly from the path's stored quotes.

## Security, cost & abuse controls

- `extract` and `embed` proxies rate-limited per IP; page cap + pre-run estimate keeps a max run to cents; global daily budget alarm. Demo graph is static (zero marginal cost).
- Same storage posture as RAG Lab: stored docs/graphs noted visibly, local-only toggle available (no permalink), owner-token deletion.

## Portfolio integration

- Repo `graphread` (public), live at graphread.vercel.app. Card thumbnail is the demo graph mid-flight; copy: "See the shape of a document."
- README pairs it with ReadLLM explicitly (shared ingestion lineage, different lens on the same problem).

## Delivery phases

1. **Phase 1 (single implementation plan):** ingest → extract with quote validation → two-pass resolution + manual merge/split → WebGL viz with side panel + provenance → demo graph + permalinks.
2. **Phase 2:** NL path queries with grounded narration, multi-document graphs, export (PNG / GraphML / JSON).

## Success criteria

- The demo graph renders in <3s, stays smooth (≈60fps) while dragging on a mid-range laptop, and every sampled edge's quote genuinely supports its relation (manual audit of 30 edges: ≥90% supported, 100% quote-validated).
- A 40-page report produces a graph where the 10 most-connected entities are recognizably the document's actual protagonists (sanity audit), with duplicate-entity rate <10% before manual correction.
- Resolution unit tests cover: alias chains, same-name-different-type collisions (no merge), and embedding-similar-but-type-incompatible pairs (no merge).
- A shared permalink opens the identical graph, corrections included.

## Decisions taken (override if you disagree)

- Name **GraphRead** (ReadLLM family); react-force-graph WebGL 2D (not 3D — prettier ≠ more legible).
- Fixed 7-type entity schema + free-verb relations; verbatim-quote validation as the hallucination gate.
- Two-pass (lexical → embedding) resolution with manual merge/split corrections rather than pretending automation suffices.

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`. This spec came through verification intact.
Graphs are small JSON, extraction cost is bounded by the page cap, and rendering is entirely
client-side — nothing here strains a free tier.

## Changes

- **Hosting:** `labs.abdash.net/graphread`. The `extract` proxy becomes
  `/api/graphread/extract`.
- **Extraction model:** OpenRouter `MODEL_CHEAP` with structured JSON output. A 40-page document
  costs roughly $0.03.
- **Resolution pass 2** uses Workers AI `@cf/baai/bge-m3` rather than an OpenAI embedding proxy —
  free, and multilingual, so entity resolution works on non-English documents without a second
  code path.
- **Quotas:** 1 extraction/day anonymous, 5/day linked, via `platform.consume_quota`. The
  owner-token-in-localStorage deletion scheme is replaced by ownership through anonymous auth.
- **Budget:** 50 MB Postgres for graphs, 50 MB Storage for source text.

## The shared-lineage claim becomes true

The spec describes ingestion as "reused ReadLLM lineage." Under seven separate repositories that
would have meant copy-pasted files drifting apart. In the monorepo, GraphRead imports
`packages/doc-core` — the same extraction and chunking code Recto and RAG Lab use, with
GraphRead's coarser ~2500-character chunking passed as a parameter rather than forked.

This is the clearest single payoff of the monorepo decision, and the README pairing with Recto
now has real substance behind it.

## Unchanged

The fixed seven-type entity schema, free-verb relations, and — most importantly — the
verbatim-quote validation gate that drops any relation whose supporting quote is not a genuine
substring of its chunk. That anti-hallucination mechanism is the project's strongest idea and is
untouched. So are the two-pass resolution, manual merge and split corrections, the demo-first
onboarding, and the deferral of natural-language path queries to phase 2.
