> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-recto-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# Recto — Design

**Date:** 2026-08-01
**Supersedes:** `2026-07-18-readllm-v2-design.md`
**Depends on:** `2026-08-01-labs-platform-design.md` (authoritative for auth, quotas, hosting,
models, and the database budget)
**One-liner:** Multi-document notebooks you can question, where every answer carries its sources
— built as an open book, and mirrored when the book reads right-to-left.

## Relationship to ReadLLM

ReadLLM v1 stays frozen and live at `readllm.vercel.app`. Recto is a new application seeded from
its codebase, not a replacement deployment. The pairing is deliberate and is itself portfolio
content: here is the honest minimal version, and here is what it becomes when the limitations its
own README admits — no auth, one notebook, no history, no OCR — are actually addressed.

Carried over as real code: `chunk.ts`, `extract.ts`, and the `\f` streaming parser. Everything
else is rebuilt.

## Why it's notable

Two features separate it from the field of NotebookLM clones. **Audio overviews** turn a notebook
into a two-host conversation. **Arabic and Turkish document intelligence** — RTL-correct rendering
plus vision-LLM OCR for scans — is something almost nobody handles well, and the author is a
trilingual speaker who can actually judge the output.

The platform's `@cf/baai/bge-m3` embedding model is multilingual by construction, so the
multilingual story is native rather than bolted on.

## Goals

1. Real per-user isolation, enforced by Postgres rather than by careful coding.
2. Notebooks containing several documents, with retrieval and citation across all of them.
3. Conversations that survive a reload.
4. Audio overviews (phase 2).
5. Arabic and Turkish support: RTL-correct rendering and OCR for scanned pages (phase 3).

## Non-goals

- Sharing, teams, collaboration. Single-user notebooks.
- Web page or YouTube ingestion. Documents only; PDF is primary.
- Native mobile. Responsive web is the whole obligation.
- Evaluation tooling — that is RAG Lab's job, and RAG Lab will benchmark Recto's defaults.

## Design: the spread

The layout is an open book. Sources sit on the verso, the conversation on the recto, a real
gutter between them, page-edge treatment at the outer margins. Typographic rather than
card-based: hairline rules, no shadows, no rounded boxes floating on grey.

When a notebook's documents are right-to-left, **the spread mirrors** — because that is what
recto and verso actually do in an Arabic or Hebrew book. The hardest technical feature in the
product becomes visible in the chrome instead of buried in a feature list.

This is a deliberate break from ReadLLM v1's warm-paper reading-room identity. The two should not
look related.

## Data model

```
recto.notebooks      id · owner_id → auth.users · title · created_at
recto.documents      id · notebook_id ⇢ cascade · owner_id · name · content_hash ·
                     page_count · status · created_at
recto.chunks         id · document_id ⇢ cascade · owner_id · content · page ·
                     chunk_index · embedding halfvec(1024)
recto.conversations  id · notebook_id ⇢ cascade · owner_id · title · created_at
recto.messages       id · conversation_id ⇢ cascade · owner_id · role · content ·
                     citations jsonb · created_at
```

- RLS `owner_id = auth.uid()` on every table, all four verbs, `with check` on insert.
- `unique (notebook_id, content_hash)` kills v1's silent duplicate uploads at the database.
- Embeddings are `halfvec` with an HNSW `halfvec_cosine_ops` index — half the bytes of `vector`
  for a recall difference below measurement noise, which matters inside a 250 MB allocation.
- **The dimension is provisional.** BGE-M3 produces 1024-dim dense vectors, but the migration
  must be written against a confirmed live call, not recollection. If it differs, the column and
  index follow the measured value.
- No storage bucket and no `storage_path`. Phase 1 never reads originals back, and phase 3's OCR
  renders pages client-side at ingest. Not storing files is what makes v1's orphaned-file bug
  impossible rather than fixed.

`recto.match_chunks(query_embedding halfvec, match_count int, nb uuid)` joins chunks through
documents and filters on notebook. It runs `security invoker` and is called with the caller's
JWT, so RLS scopes retrieval automatically — there is no code path with the privilege to read
another user's chunks. Citations carry `(document name, page)` so cross-document answers stay
attributable.

## Core flows

**Ingest.** Extract and chunk client-side, unchanged from v1. Batches drop from 50 chunks to
**20** to stay inside the Workers 10 ms CPU budget. `/api/recto/ingest` embeds via the Workers AI
binding, checks `platform.consume_quota('recto','documents',1)`, and inserts. Duplicate content
hashes are rejected with an honest message rather than silently accepted.

**Chat.** Question → embed → `match_chunks(notebook)` top-8 → streamed answer using v1's `\f`
protocol, which works and is kept. Messages persist as they complete; reopening a notebook
restores its conversations.

**Audio overview (phase 2).** An LLM writes a two-host dialogue grounded in top chunks from each
document; per-speaker TTS produces two voices; segments are concatenated and stored. Given the
account's 10,000 character monthly ElevenLabs ceiling, this is explicitly a **rate-limited,
manually triggered, one-per-day-per-user** feature, and the generated script is displayed
alongside the audio so the feature degrades to something readable when credits are gone.

**OCR (phase 3).** When pdf.js finds no text layer, the page renders to an image client-side and
goes to a vision model through OpenRouter — chosen over tesseract.js because Arabic tesseract
quality is poor. Per-document cap of 50 OCR pages with a visible cost notice. Content renders
with `dir="auto"`; UI strings stay English.

## Security & cost

Everything inherits from the platform spec: anonymous-first auth, tiered quotas (1 notebook /
3 documents / 20 messages a day anonymous, 3 / 10 / 200 linked), caller-JWT database access,
Turnstile. Recto adds nothing bespoke, which is the point of having a platform layer.

Embeddings are free via Workers AI. Chat runs on `MODEL_CHEAP` by default at roughly $0.001 a
turn.

## Delivery phases

1. **Phase 1** — schema and RLS, notebooks CRUD, multi-document ingest with dedupe, cross-document
   cited retrieval, conversation persistence, the spread UI, deploy at `labs.abdash.net/recto`.
2. **Phase 2** — audio overviews.
3. **Phase 3** — vision OCR fallback, RTL rendering, a mixed-language demo notebook.

## Success criteria

- A stranger creates a notebook with two PDFs, asks a cross-document question, and gets a
  correctly cited answer — with no ability to see anyone else's data, proven by RLS tests rather
  than asserted.
- Conversations survive reload. Deleting a document removes its chunks and leaves citations
  working for the rest.
- Phase 2: a two-document notebook produces a listenable three-to-six-minute overview.
- Phase 3: a scanned Arabic PDF ingests, answers in English, and cites the right pages.

## Decisions taken

- Name **Recto**; ReadLLM v1 stays frozen and live as the paired "before".
- The spread layout, mirroring for RTL.
- `halfvec` embeddings from bge-m3, dimension confirmed against a live call before migration.
- No originals bucket, permanently.
- Ingest batches of 20, sized by the Workers CPU limit rather than by preference.
