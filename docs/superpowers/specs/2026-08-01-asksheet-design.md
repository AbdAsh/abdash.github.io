# AskSheet — Spreadsheet Agent — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-asksheet-design.md`
**Depends on:** `2026-08-01-platform-design.md`
**One-liner:** Drop a CSV, ask questions in plain English; an LLM writes SQL and chart specs, and
DuckDB-WASM executes them entirely in the browser — the data never leaves the machine.

## Why it's notable

Every "chat with your data" product uploads your data. AskSheet's headline is that it doesn't:
the file is parsed and queried locally via DuckDB-WASM, and only the *schema* and a question
travel to the LLM. That privacy inversion is immediately legible to non-technical visitors ("my
numbers stay on my laptop") and technically interesting to engineers — a code-generating agent
over a WASM analytics engine, with transparent SQL. Showing the generated query for every answer
is the trust feature that separates it from black-box copilots.

This spec came through verification better than any other in the lineup. The client-side
execution model that makes it notable also makes it immune to nearly every free-tier constraint
that damaged its siblings.

## Goals

1. CSV/TSV in → natural-language Q&A with tables and charts out, executed fully client-side.
2. Every answer shows its work: the exact SQL, expandable and copyable.
3. Follow-up questions work conversationally ("now only 2024", "break that down by region").
4. An honest privacy contract, visible in the UI: what leaves the browser (schema, question, up
   to five sample values per column) and what never does (the data). A **strict mode** toggle
   sends schema only.
5. Zero-backend execution. The only server component is the planning proxy.

## Non-goals

- Excel `.xlsx` in v1 (phase 2 via SheetJS). CSV/TSV only.
- Multi-file joins (phase 2).
- Write operations, or exports beyond CSV download of a result table.
- Server-side persistence of user data. There is nothing to store, permanently.

## Architecture

```
Vite + React + TS SPA → Cloudflare Pages at labs.abdash.net/asksheet
  ├─ File → DuckDB-WASM table (worker thread; inferred types shown for correction)
  ├─ Profiler: column names, inferred types, row count, 5 sample values/col
  │            (sample values skipped entirely in strict mode)
  ├─ Chat loop: profile + conversation summary + question
  │      └─ fetch → Supabase Edge Function `asksheet-plan`
  │            └─ OpenRouter MODEL_CHEAP → strict JSON { sql, chart?, narration }
  ├─ DuckDB executes sql locally → result table
  ├─ chart? → Vega-Lite spec rendered client-side
  └─ Error loop: SQL error → one automatic repair round-trip, then surface honestly
```

- **LLM output contract:** strict JSON schema — `sql` (a single SELECT), optional `chart` (a
  Vega-Lite spec referencing result columns), `narration` (one-sentence framing). No free-text SQL
  extraction; schema-validated with one retry on validation failure.
- **SQL safety:** DuckDB-WASM runs in-memory on a local copy, so the worst case is a wrong answer
  rather than damage. Still enforced: single-statement SELECT only (no PRAGMA, COPY, or ATTACH),
  plus a query timeout and row limit so a pathological cross join cannot freeze the tab.
- **Conversation state:** prior question→SQL pairs feed the next prompt — never results — so
  follow-ups resolve references without shipping data.
- **Charts:** Vega-Lite, spec-driven. The LLM emits a spec and the client renders it; there is no
  chart-type switch statement to maintain.

## Verified: cross-origin isolation is optional

DuckDB-WASM's multi-threaded build requires `SharedArrayBuffer`, which requires COOP/COEP
cross-origin isolation headers. **The single-threaded build does not.**

Ship single-threaded first. If the 50k-row responsiveness target is missed, add COOP/COEP for
`/asksheet/*` only, via a path-scoped rule in Cloudflare Pages `_headers`. Because each app is a
separate document under the shared origin, path-scoped isolation does not affect the other six.
This was the one place the single-origin decision could have caused trouble, and it does not.

## Core flows

- **Onboarding:** a one-line pitch, the privacy contract, a dropzone, and two bundled sample
  datasets — so the demo works with zero effort, which is critical for portfolio visitors who
  will not go hunting for a CSV.
- **Ingest:** parse with PapaParse → register in DuckDB → show inferred schema chips with editable
  types → suggest three starter questions generated from the schema.
- **Ask:** question → planned SQL → local execution → result table, optional chart, narration,
  with a collapsed SQL disclosure. Failed SQL auto-repairs once; persistent failure shows the
  error honestly alongside the attempted query.
- **Iterate:** follow-ups, pin results, download any result table as CSV.

## Security, cost & abuse controls

`asksheet-plan` is the only spend surface. It uses the platform's anonymous session and
`platform.consume_quota('asksheet','plans',1)` — 20 plans a day anonymous, 100 linked.

The July spec proposed "a lightweight anonymous session token to blunt scripted farming." That
invented mechanism is dropped in favour of real anonymous Supabase auth, which does the job
properly. This does not compromise the privacy thesis: an anonymous session identifies a browser
for quota purposes and stores nothing whatsoever about the data.

Per-request token cap, `MODEL_CHEAP` by default. No logging of question content beyond transient
function logs, stated in the privacy note. AskSheet owns **no Postgres schema and no storage
allocation** — it touches only `platform.usage_counters`.

## Delivery phases

1. **Phase 1** — CSV/TSV ingest, schema profiling and correction UI, the plan→execute→render loop
   with SQL disclosure and one-shot repair, strict mode, bundled samples, the rate-limited proxy,
   deploy.
2. **Phase 2** — XLSX via SheetJS, multi-file joins, a pinned-result dashboard view, shareable
   data-free question permalinks.

## Success criteria

- The bundled sample answers "which month had the highest revenue and why is it an outlier?"
  correctly, with a chart, in one round-trip, on a cold visit.
- **The DevTools network tab during a full session shows zero requests carrying row data** — only
  schema and sample payloads to `asksheet-plan`, and none of the latter in strict mode. This check
  is documented in the README as the proof-of-claim.
- A malformed CSV (ragged rows, wrong delimiters) fails with a helpful message, not a blank
  screen.
- A 50k-row file stays responsive, under about 2 s for a typical query, on a mid-range laptop.

## Decisions taken

- Name **AskSheet**; PapaParse + DuckDB-WASM for data, Vega-Lite for charts, `MODEL_CHEAP` planner.
- No accounts beyond the shared anonymous session; no persistence; no server-side data — by
  design, permanently.
- Sample values on by default with visible disclosure plus a strict-mode toggle: better answers by
  default, informed opt-out.
- Single-threaded DuckDB first; cross-origin isolation only if measurement demands it.
