# Recto — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-readllm-v2-design.md`, `archive/2026-08-01-recto-design-DRAFT1.md`
**Depends on:** `2026-08-01-platform-design.md` — authoritative for stack, auth, quotas, budgets
**One-liner:** Multi-document notebooks you can question, where every answer carries its sources
— built as an open book, and mirrored when the book reads right-to-left.

## Relationship to ReadLLM

ReadLLM v1 stays frozen and live at `readllm.vercel.app`. Recto is a new application seeded from
its codebase, not a replacement deployment. The pairing is deliberate portfolio content: here is
the honest minimal version, and here is what it becomes when the limitations its own README
admits — no auth, one notebook, no history, no OCR — are actually addressed.

Carried over as real code: `chunk.ts`, `extract.ts`, and the `\f` streaming parser. The `\f`
protocol works and is kept unchanged. Everything else is rebuilt.

## Why it's notable

Two features separate it from the field of NotebookLM clones. **Audio overviews** turn a notebook
into a two-host conversation. **Arabic and Turkish document intelligence** — RTL-correct rendering
plus vision OCR for scans — is something almost nobody handles well, and the author is a
trilingual speaker who can actually judge the output.

## Goals

1. Real per-user isolation, enforced by Postgres rather than by careful coding.
2. Notebooks holding several documents, with retrieval and citation across all of them.
3. Conversations that survive a reload.
4. Audio overviews (phase 2).
5. Arabic and Turkish support: RTL rendering and OCR for scanned pages (phase 3).

## Non-goals

- Sharing, teams, collaboration. Single-user notebooks.
- Web page or YouTube ingestion. Documents only; PDF is primary.
- Native mobile. Responsive web is the whole obligation.
- Evaluation tooling — RAG Lab's job, and RAG Lab will set Recto's defaults.

## Design: the spread

The layout is an open book. Sources on the verso, conversation on the recto, a real gutter
between them, page-edge treatment at the outer margins. Typographic rather than card-based:
hairline rules, no shadows, no rounded boxes floating on grey.

When a notebook's documents are right-to-left, **the spread mirrors** — because that is what
recto and verso do in an Arabic or Hebrew book. The hardest technical feature becomes visible in
the chrome instead of buried in a feature list.

A deliberate break from ReadLLM v1's warm-paper reading-room identity. The two should not look
related.

## Data model — `recto` schema

```
recto.notebooks      id · owner_id → auth.users · title · created_at
recto.documents      id · notebook_id ⇢ cascade · owner_id · name · content_hash ·
                     page_count · status · created_at
recto.chunks         id · document_id ⇢ cascade · owner_id · content · page ·
                     chunk_index · embedding halfvec(1536)
recto.conversations  id · notebook_id ⇢ cascade · owner_id · title · created_at
recto.messages       id · conversation_id ⇢ cascade · owner_id · role · content ·
                     citations jsonb · created_at
```

- RLS `owner_id = auth.uid()` on every table, all four verbs, `with check` on insert.
- `unique (notebook_id, content_hash)` kills v1's silent duplicate uploads at the database rather
  than in the UI.
- Embeddings are `halfvec(1536)` from OpenAI `text-embedding-3-small`, with an HNSW
  `halfvec_cosine_ops` index. Half the bytes of `vector` for a recall difference below
  measurement noise — which is what keeps 250 MB comfortable rather than tight.
- **No storage bucket, no `storage_path`.** Phase 1 never reads originals back, and phase 3's OCR
  renders pages client-side at ingest. Not storing files is what makes v1's orphaned-file bug
  impossible rather than merely fixed.

`recto.match_chunks(query_embedding halfvec, match_count int, nb uuid)` joins chunks through
documents and filters on notebook. It runs `security invoker` and is called with the caller's
JWT, so RLS scopes retrieval automatically — no code path has the privilege to read another
user's chunks. Citations carry `(document name, page)` so cross-document answers stay
attributable.

Notebook lists and conversation history are read straight through PostgREST under RLS. v1's
`documents` and `delete-document` functions are deleted, not ported: neither had server logic
left once policies do the filtering.

## Edge Functions

`recto-ingest` · `recto-chat` · `recto-audio-overview` (phase 2)

**Ingest.** Extract and chunk client-side, unchanged from v1, in batches of 50 — Supabase's 2 s
CPU and 150 s wall clock leave ample room, so the batch size is set by OpenAI's embedding request
limits rather than by compute. The function embeds the batch in one call, checks
`platform.consume_quota('recto','documents',1)` on first batch, and inserts. Duplicate content
hashes are rejected with an honest message.

**Chat.** Question → embed → `match_chunks(notebook)` top-8 → streamed answer over the `\f`
protocol. Messages persist as they complete; reopening a notebook restores its conversations.

**Audio overview (phase 2).** An LLM writes a two-host dialogue grounded in top chunks from each
document; per-speaker TTS produces two voices; segments are concatenated and stored. Given the
account's 10,000-character monthly ElevenLabs ceiling, this is explicitly **manually triggered
and capped at one per user per day**, and the generated script is displayed alongside the audio
so the feature degrades to something readable when credits run out.

**OCR (phase 3).** When pdf.js finds no text layer, the page renders to an image client-side and
goes to a vision model through OpenRouter — chosen over tesseract.js because Arabic tesseract
quality is poor. Per-document cap of 50 OCR pages with a visible cost notice. Content renders
with `dir="auto"`; UI strings stay English.

## Security & cost

Everything inherits from the platform spec: anonymous-first auth, tiered quotas (1 notebook /
3 documents / 20 messages a day anonymous; 3 / 10 / 200 linked), caller-JWT database access,
Turnstile. Recto adds nothing bespoke, which is the point of having a platform layer.

Embeddings cost about $0.001 per hundred-page document. Chat runs on `MODEL_CHEAP` at roughly
$0.001 a turn.

## Delivery phases

1. **Phase 1** — schema and RLS, notebooks CRUD, multi-document ingest with dedupe,
   cross-document cited retrieval, conversation persistence, the spread UI, deployed at
   `labs.abdash.net/recto`.
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
- `halfvec(1536)` from OpenAI `text-embedding-3-small`.
- No originals bucket, permanently.
- Client-side reads through PostgREST replace v1's `documents` and `delete-document` functions.
