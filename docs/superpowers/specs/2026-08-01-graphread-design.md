# GraphRead — Knowledge-Graph Explorer — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-graphread-design.md`
**Depends on:** `2026-08-01-platform-design.md`
**One-liner:** Feed it a document; it extracts the entities and relationships and renders them as
an interactive, queryable force-directed graph — every node and edge traceable back to the source
passage that asserted it.

## Why it's notable

It is the visual centrepiece of the lineup: a living graph you can fly around is the screenshot
that makes people click. Under the flash sits real engineering — cross-chunk entity resolution,
which is the genuinely hard problem, provenance-preserving extraction, and WebGL graph rendering
— and it plays directly to the author's frontend craft. It pairs with Recto as a family: Recto
answers questions about a document, GraphRead shows you its shape.

## Goals

1. PDF or pasted text in → entity/relation graph out, explorable at 60fps for typical documents.
2. **Provenance everywhere:** click any node or edge and see the exact source passages that
   produced it — the same citation ethic as Recto.
3. Cross-chunk entity resolution: "Dr. Sarah Chen," "Chen," and "the lead researcher" merge into
   one node with recorded aliases.
4. Graph query in natural language ("how are X and Y connected?") answered with a highlighted path
   and a narration grounded in the path's evidence (phase 2).
5. Shareable graph permalinks, and a preloaded demo graph so the card demo is instant.

## Non-goals

- Multi-document or corpus-level graphs in v1. Single document; phase 2.
- Ontology configuration UIs. v1 uses one fixed general schema.
- Hand editing of the graph, beyond the merge/split corrections below.
- Being a GraphRAG *answering* engine. Retrieval-augmented answering stays Recto's job;
  GraphRead's phase-2 queries are about structure — paths and neighbourhoods — not general Q&A.

## Architecture

```
Vite + React + TS SPA → Cloudflare Pages at labs.abdash.net/graphread
  ├─ packages/doc-core: pdf.js extract + chunking, coarser ~2500 chars via parameter
  ├─ fetch → Supabase Edge Function `graphread-extract`  (OpenRouter MODEL_CHEAP)
  │     per chunk → strict JSON:
  │       entities[{name, type, description}]
  │       relations[{source, relation, target, quote}]
  ├─ Entity resolution IN BROWSER (deterministic first, cheap second):
  │     pass 1 — normalized-name and alias matching
  │     pass 2 — embedding similarity on name+description via `raglab-embed`,
  │              gated on type compatibility → merge sets with recorded aliases
  ├─ Graph assembly: nodes/edges carrying provenance (chunk ids, quotes); weights = mention counts
  └─ Rendering: react-force-graph (WebGL 2D) — size by degree, color by type, hover
        highlight, click → side panel (aliases, relations, source passages)

Supabase: graphread.graphs · nodes · edges  (+ document text in Storage) → permalink slugs
```

- **Fixed v1 schema:** entity types are {person, organization, place, concept, event, artifact,
  date}. Relations are free-text verb phrases normalized to lowercase ("works for", "funded by")
  rather than a closed set — a closed relation ontology fights real documents and produces worse
  graphs than honest verb phrases.
- **Extraction contract:** every relation must carry a supporting `quote` that is a verbatim
  substring of its chunk, validated client-side against the chunk text. Relations whose quote
  fails validation are dropped. **This is the anti-hallucination gate and the project's strongest
  idea** — it is what makes provenance a guarantee rather than a claim.
- **Resolution correctness valve:** automatic merging will make mistakes, so the UI ships "split
  node" to undo a merge and "merge nodes" by dragging one onto another, with corrections stored
  alongside the graph. This converts the hardest failure mode into a feature.

## The shared-lineage claim becomes true

The July spec described ingestion as "reused ReadLLM lineage." Across seven separate repositories
that would have meant copy-pasted files drifting apart within a month.

In the monorepo GraphRead **imports `packages/doc-core`** — the same extraction and chunking code
Recto and RAG Lab use, with the coarser chunk size passed as a parameter rather than forked. Its
resolution pass reuses `raglab-embed` rather than standing up a second embedding proxy. This is
the clearest single payoff of the monorepo decision, and it gives the README's Recto pairing real
substance.

## Core flows

- **Demo-first:** the AI-tab card and the landing page open a preloaded demo graph built at build
  time from a public-domain text. Zero-effort wow, and zero marginal cost since it is static.
- **Own document:** upload → cost estimate, since extraction is per-chunk LLM work, with a cap
  around 60 pages → progress as chunks extract and the graph grows live, which is itself good
  theatre over 30–90 seconds → explore → optional permalink.
- **Explore:** node search, type filter chips, click a node for a panel with description, aliases,
  relations grouped by type, and source quotes. Click an edge for its quotes. Double-click
  isolates a node's neighbourhood.
- **Query (phase 2):** natural-language question → shortest or strongest paths between resolved
  endpoints → path highlighted in the visualization, with narration generated strictly from the
  path's stored quotes.

## Security, cost & abuse controls

`graphread-extract` is the spend surface: OpenRouter `MODEL_CHEAP` with structured JSON output, at
roughly $0.03 for a 40-page document. Quota tiers of 1 extraction a day anonymous and 5 linked via
`platform.consume_quota`, plus the page cap and the pre-run estimate, keep any single run to
cents. The demo graph is static and free.

Stored documents and graphs are noted visibly; a local-only toggle skips persistence and produces
no permalink. Ownership comes from the anonymous session, replacing the July spec's owner-token
scheme. Budget: 50 MB Postgres, 50 MB Storage.

## Delivery phases

1. **Phase 1** — ingest → extraction with quote validation → two-pass resolution with manual
   merge/split → WebGL visualization with provenance side panel → demo graph → permalinks.
2. **Phase 2** — natural-language path queries with grounded narration, multi-document graphs,
   export as PNG / GraphML / JSON.

## Success criteria

- The demo graph renders in under 3 s and stays smooth, around 60fps, while dragging on a
  mid-range laptop.
- Manual audit of 30 edges: at least 90% have quotes that genuinely support the relation, and
  100% are quote-validated.
- A 40-page report produces a graph whose ten most-connected entities are recognizably the
  document's actual protagonists, with a duplicate-entity rate under 10% before manual correction.
- Resolution unit tests cover alias chains, same-name-different-type collisions (no merge), and
  embedding-similar-but-type-incompatible pairs (no merge).
- A shared permalink opens the identical graph, corrections included.

## Decisions taken

- Name **GraphRead** (the Recto family); react-force-graph WebGL 2D, not 3D — prettier is not
  more legible.
- Fixed seven-type entity schema with free-verb relations; verbatim-quote validation as the
  hallucination gate.
- Two-pass resolution, lexical then embedding, with manual merge/split corrections rather than
  pretending automation suffices.
- Imports `packages/doc-core` and reuses `raglab-embed`; no duplicated ingestion or embedding code.
