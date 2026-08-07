> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-asksheet-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# AskSheet — Spreadsheet Agent — Design

**Date:** 2026-07-18
**One-liner:** Drop a CSV, ask questions in plain English; an LLM writes SQL and chart specs, and DuckDB-WASM executes them entirely in the browser — the data never leaves the machine.

## Why it's notable

Every "chat with your data" product uploads your data. AskSheet's headline is that it doesn't: the file is parsed and queried locally via DuckDB-WASM, and only the *schema* and a question travel to the LLM. That privacy inversion is immediately understandable to non-technical visitors ("my numbers stay on my laptop") and technically interesting to engineers (code-generating agent + WASM analytics engine + transparent SQL). Showing the generated SQL for every answer is the trust feature that separates it from black-box copilots.

## Goals

1. CSV/TSV in → natural-language Q&A with tables and charts out, fully client-side execution.
2. Every answer shows its work: the exact SQL executed, expandable, copyable.
3. Follow-up questions work conversationally ("now only 2024", "break that down by region").
4. Honest privacy contract, visible in the UI: what leaves the browser (schema + question + up to 5 sample values per column) and what never does (the data). A **strict mode** toggle sends schema only, no sample values.
5. Zero-backend execution path; the only server component is the LLM proxy.

## Non-goals

- Excel `.xlsx` in v1 (phase 2 via SheetJS); v1 is CSV/TSV.
- Multi-file joins (phase 2).
- Write operations, exports back to file formats beyond CSV download of a result table.
- Server-side persistence of any user data — there are no accounts and nothing to store.

## Architecture

```
Vite + React + TS SPA (Vercel)
  ├─ File → DuckDB-WASM table (worker thread; header/type inference shown to user for correction)
  ├─ Profiler: column names, inferred types, row count, 5 sample values/col (skipped in strict mode)
  ├─ Chat loop: profile + conversation summary + question
  │      └─ fetch → Supabase Edge Function `plan` (rate-limited LLM proxy)
  │            └─ LLM returns structured JSON: { sql, chart?, narration }
  ├─ DuckDB executes sql locally → result table
  ├─ chart? → Vega-Lite spec rendered client-side
  └─ Error loop: SQL error → one automatic repair round-trip (error + schema → fixed SQL), then surface
```

- **LLM output contract:** strict JSON schema — `sql` (a single SELECT), optional `chart` (Vega-Lite spec referencing result columns), `narration` (one-sentence answer framing). No free-text SQL extraction; schema-validated, one retry on validation failure.
- **SQL safety:** DuckDB-WASM runs in-memory on a local copy — worst case is a wrong answer, not damage. Still: single-statement SELECT enforced by validation (no PRAGMA/COPY/ATTACH), query timeout + row limit so a pathological cross join can't freeze the tab.
- **Conversation state:** prior Q→SQL pairs (not results) feed the next prompt, so follow-ups resolve references without shipping data.
- **Charts: Vega-Lite** (spec-driven — the LLM emits a spec, the client renders it; no chart-type switch statement to maintain).

## Core flows

- **Onboarding:** landing shows a one-line pitch, the privacy contract, a dropzone, and 2 bundled sample datasets (so the demo works with zero effort — critical for portfolio visitors who won't hunt for a CSV).
- **Ingest:** parse (PapaParse) → register in DuckDB → show inferred schema chips (editable types) → suggest 3 starter questions generated from the schema.
- **Ask:** question → planned SQL → local execution → result table + optional chart + narration, with a collapsed "SQL" disclosure. Failed SQL auto-repairs once; persistent failure shows the error honestly with the attempted SQL.
- **Iterate:** follow-ups, pin results, download any result table as CSV.

## Security, cost & abuse controls

- The `plan` edge function is the only spend surface: per-IP rate limit (e.g. 20 plans/hour), per-request token cap, `gpt-4o-mini` default (SQL planning is well within its ability; model overridable by secret).
- Origin check (site origin only)  + lightweight anonymous session token to blunt scripted farming — accepted residual risk equivalent to ReadLLM v1's gate, but here the proxy does nothing except emit SQL text, so the abuse value is low.
- No logging of question content beyond transient function logs; stated in the privacy note.

## Portfolio integration

- Repo `asksheet` (public), live at asksheet.vercel.app; AI-tab card links both. Card copy leads with the privacy inversion.
- Browser support note: DuckDB-WASM needs modern desktop/mobile browsers; unsupported browsers get a static explainer with a short screen recording.

## Delivery phases

1. **Phase 1 (single implementation plan):** CSV/TSV ingest, schema profiling + correction UI, plan→execute→render loop with SQL disclosure and one-shot repair, strict mode, samples, rate-limited proxy, deploy.
2. **Phase 2:** XLSX via SheetJS, multi-file joins, pinned-result dashboard view, shareable (data-free) question permalinks.

## Success criteria

- The bundled sample answers "which month had the highest revenue and why is it an outlier?" correctly with a chart, in one round-trip, on a cold visit.
- DevTools network tab during a full session shows zero requests carrying row data — only schema/sample payloads to `plan` (and none of the latter in strict mode). This check is documented in the README as the proof-of-claim.
- A malformed CSV (ragged rows, wrong delimiters) fails with a helpful message, not a blank screen.
- 50k-row file stays responsive (<2s typical query) on a mid-range laptop.

## Decisions taken (override if you disagree)

- Name **AskSheet**; repo `asksheet`.
- Vega-Lite for charts; PapaParse + DuckDB-WASM for data; `gpt-4o-mini` default planner.
- No accounts, no persistence, no server-side data — by design, permanently.
- Sample values ON by default with visible disclosure + strict-mode toggle (better answers by default, informed opt-out).

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`. This spec survived verification better than
any other in the lineup — the client-side execution model that makes it notable also makes it
immune to nearly every free-tier constraint that damaged its siblings.

## Changes

**Hosting.** Cloudflare Pages at `labs.abdash.net/asksheet`, not `asksheet.vercel.app`. The
`plan` endpoint becomes a Pages Function at `/api/asksheet/plan`.

**Drop the bespoke session token.** The spec proposed "a lightweight anonymous session token to
blunt scripted farming." The platform now provides real anonymous Supabase auth, so use it:
`platform.consume_quota('asksheet','plans',1)` gives per-user rate limiting that the invented
token could not. This does not compromise the privacy thesis — an anonymous session identifies a
browser for quota purposes and stores nothing about the data.

**Model.** OpenRouter `MODEL_CHEAP` rather than `gpt-4o-mini` by name. SQL planning is well inside
cheap-tier ability, as the original spec argued. No embeddings are involved, so OpenRouter's
missing embeddings endpoint costs this project nothing.

## Verified: cross-origin isolation is optional

DuckDB-WASM's multi-threaded build requires `SharedArrayBuffer`, which requires COOP/COEP
cross-origin isolation headers. The single-threaded build does not.

Ship single-threaded first. If the 50k-row responsiveness target is missed, add COOP/COEP for
`/asksheet/*` only, via a path-scoped rule in Cloudflare Pages `_headers`. Because each app is a
separate document under the shared origin, path-scoped isolation does not affect the other six —
this was the one place the single-origin decision could have caused trouble, and it does not.

## Unchanged

The privacy contract, strict mode, the SQL disclosure, Vega-Lite charts, the one-shot repair
loop, and the DevTools proof-of-claim in the README all stand exactly as written. So does zero
persistence: AskSheet gets no Postgres schema and no storage allocation.
