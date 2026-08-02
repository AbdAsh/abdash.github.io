> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-recto-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# ReadLLM v2 — Design

> **SUPERSEDED 2026-08-01 by `2026-08-01-recto-design.md`.**
> The product survives; the identity and the stack do not. It ships as **Recto** — a new
> application seeded from this codebase rather than an in-place upgrade — and ReadLLM v1 stays
> frozen and live at `readllm.vercel.app` as the paired "before". Also overridden here: the
> dedicated Supabase project (one shared project now hosts all seven apps), Vercel hosting
> (Cloudflare Pages), OpenAI embeddings (Workers AI `bge-m3`), magic-link-only auth
> (anonymous-first plus OAuth plus magic link), and the storage bucket for originals (dropped).
> Retained for the record — the reasoning about RLS, cross-document retrieval, and audio
> overviews carried forward largely intact.

**Date:** 2026-07-18
**Base:** existing codebase at `~/Desktop/ReadLLM` (local-only git repo, live at readllm.vercel.app)
**One-liner:** Evolve ReadLLM from a single-notebook RAG demo into a real multi-user product: accounts, multi-document notebooks, persistent conversations, audio overviews, and (phase 3) first-class Arabic/Turkish document support.

## Why v2 is notable

v1 is an honest minimal NotebookLM. v2 closes exactly the gaps v1's own docs list — no auth (with a known delete IDOR), one notebook, no history, no OCR — and adds two features that make it stand out from the thousand NotebookLM clones: **audio overviews** (a notebook becomes a two-host podcast) and **Arabic/Turkish document intelligence** (RTL rendering + vision-LLM OCR), which almost nobody handles well and which the author can uniquely dogfood as a trilingual speaker.

## Goals

1. Real authentication and per-user isolation (fixes the IDOR by construction, not by patch).
2. Notebooks containing multiple documents, with retrieval and citations across all documents in a notebook.
3. Persistent conversation history per notebook.
4. Audio overview generation (phase 2).
5. Arabic/Turkish support: RTL-correct UI and OCR for scanned/Arabic PDFs (phase 3).
6. Public GitHub repo suitable for portfolio scrutiny.

## Non-goals

- Teams/sharing/collaboration (single-user accounts only).
- Web-page or YouTube ingestion (documents only; PDF stays the primary format).
- Mobile apps. The web app must be responsive; that is all.
- Building the eval suite inside ReadLLM — that lives in RAG Lab (project #5), which will consume ReadLLM's settings.

## Architecture

Same shape as v1, with auth replacing the shared-secret gate:

```
Vite + React + TS (Vercel)
  ├─ Supabase Auth (magic link + Google OAuth) — session JWT
  ├─ pdf.js extract + chunk client-side (unchanged from v1)
  └─ fetch → Supabase Edge Functions with the USER's JWT
        ▼
Supabase Cloud — NEW project (v1's project and its live data stay untouched)
  ├─ Postgres + pgvector, RLS on every table scoped to auth.uid()
  ├─ Storage: private `documents` bucket, path tracked on the row (fixes v1's orphaned files)
  └─ Edge Functions (Deno): ingest · chat · audio-overview · (documents/delete fold into
     direct RLS-guarded table access where trivial, stay functions where logic lives)
```

**Auth model change:** v1's `x-app-secret` gate and legacy-anon-JWT arrangement are removed entirely. Edge functions validate the caller's Supabase Auth JWT and derive `user_id` from it; the service-role client is used only after that check, with every query filtered by the derived `user_id`. Client-side table reads (notebook list, conversation history) go straight through RLS policies instead of dedicated functions.

## Data model

```
notebooks      id · owner_id → auth.users · title · created_at
documents      id · notebook_id FK cascade · owner_id · name · storage_path · page_count · status · created_at
chunks         id · document_id FK cascade · owner_id · content · page · embedding vector(1536)
conversations  id · notebook_id FK cascade · owner_id · title (auto from first question) · created_at
messages       id · conversation_id FK cascade · owner_id · role · content · citations jsonb · created_at
audio_overviews id · notebook_id FK cascade · owner_id · status · storage_path · script jsonb · created_at
```

- RLS: `owner_id = auth.uid()` for select/insert/update/delete on all six tables. No exceptions.
- `match_chunks` RPC gains a `notebook` parameter and joins through documents, so retrieval spans all documents in the notebook; citations carry `(document name, page)` so cross-document answers stay attributable.
- Embeddings stay OpenAI `text-embedding-3-small` (1536) — multilingual, so phase 3 needs no re-embedding.

## Core flows

- **Ingest:** unchanged client-side extract/chunk pipeline; `ingest` now also writes `storage_path` and requires a target `notebook_id`. Duplicate-file detection by content hash per notebook (v1 allowed silent duplicates).
- **Chat:** question → embed → `match_chunks(notebook)` top-8 (up from 6, tuned later in RAG Lab) → streamed answer with the v1 `\f` citations protocol (kept — it works). Messages persist to `messages` as they complete; reloading a notebook restores its conversations.
- **Audio overview (phase 2):** user clicks "Generate overview" on a notebook → `audio-overview` function: (1) LLM produces a two-host dialogue script grounded in top chunks from each document, (2) per-speaker TTS via ElevenLabs (two distinct voices), (3) segments concatenated and stored; UI polls status then shows an audio player. Regeneration is manual and rate-limited (this is the expensive feature); the script is stored for display alongside the audio.
- **OCR (phase 3):** when pdf.js yields no text layer for a page, the page renders to an image client-side and goes to a vision-LLM OCR path in `ingest` (chosen over tesseract.js because Arabic tesseract quality is poor). Per-document page cap (default 50 OCR pages) with a visible cost notice. UI ships RTL-aware rendering (`dir="auto"` on content, mirrored layout audit) and Arabic/Turkish UI strings stay out of scope — English UI, multilingual documents.

## Security, cost & abuse controls

- Auth required for everything; no anonymous ingestion or chat. Signup is open (it's a portfolio piece — people must be able to try it) but new accounts get quotas: max 3 notebooks, 10 documents total across notebooks, 200 chat messages/day, 1 audio overview/day (values in a config table, adjustable without deploy).
- Monthly OpenAI + ElevenLabs budget alarms; `CHAT_MODEL` stays overridable to downshift cost.
- Storage originals remain private; deletion now removes storage objects via the tracked path.

## Repo & deployment

- Copy `~/Desktop/ReadLLM` (preserving git history — it documents real process) to a proper workspace location, add GitHub remote, make public **after** a history audit for secrets (`.env` was always gitignored; audit confirms nothing leaked; the v1 project-ref/anon-key references in docs are rotated/retired anyway by moving to the new Supabase project).
- Keep the name **ReadLLM** and the readllm.vercel.app deployment; v2 replaces it in place once phase 1 is feature-complete (v1 has no real users to migrate — the one live document is the author's own).

## Delivery phases

1. **Phase 1 — the product core (first implementation plan):** new Supabase project + migrations, auth UI + session handling, notebooks + multi-doc ingest + scoped retrieval, conversation persistence, quotas, repo publication, deploy. Tab card goes live pointing at it.
2. **Phase 2 — audio overviews:** script generation + ElevenLabs pipeline + player.
3. **Phase 3 — Arabic/Turkish:** vision-OCR fallback, RTL content rendering, mixed-language notebook demo content.

## Success criteria

- A stranger can sign up, create a notebook with 2+ PDFs, ask a cross-document question, and get a correctly cited answer — with zero ability to see anyone else's data (verified by RLS tests, not intent).
- Conversations survive reload. Deleting a document removes its chunks, citations keep working for remaining documents, and the storage object is gone.
- Phase 2: a 2-document notebook produces a listenable 3–6 minute two-voice overview.
- Phase 3: a scanned Arabic PDF ingests, is queryable in English, and cites correct pages.

## Decisions taken (override if you disagree)

- Fresh Supabase project; v1's stays untouched. Name stays ReadLLM; same Vercel app.
- Magic link + Google OAuth (no passwords to manage).
- Vision-LLM OCR over tesseract.js (Arabic quality) despite marginal per-page cost.
- Client-side table reads through RLS replace the `documents`/`delete-document` functions where no server logic remains.
