# Labs Platform — Design

**Date:** 2026-08-01
**Status:** Authoritative for all shared decisions. Where a project spec disagrees with this
document, this document wins.
**One-liner:** One monorepo, one Cloudflare Pages origin, one Supabase project, one login —
hosting seven AI demos that share a platform layer instead of reimplementing it seven times.

## The stack

Fixed, and not open for per-project reinterpretation:

| Layer | Technology | Scope |
|---|---|---|
| Web deployment | **Cloudflare Pages** | Static hosting only. No Workers, no Pages Functions. |
| Database | **Supabase Postgres + pgvector** | Schema per app, RLS everywhere |
| Data API | **Supabase PostgREST** | Client reads/writes go straight through RLS |
| Auth | **Supabase Auth** | Anonymous · GitHub · Google · magic link |
| File storage | **Supabase Storage** | Private buckets, per-app |
| Backend logic | **Supabase Edge Functions** (Deno) | Every server-side operation |
| LLM calls | **OpenRouter** | Chat, vision, structured extraction |
| Embeddings | **OpenAI** | `text-embedding-3-small`, 1536 dims |

Cloudflare's role begins and ends at serving static files. Anything that executes on a server
executes in a Supabase Edge Function.

## Verified constraints

Checked against vendor documentation on 2026-08-01, not recalled.

| Platform | Limits that shape the design |
|---|---|
| Supabase project | **2 active projects** on free, 500 MB Postgres, 1 GB Storage, 50k MAU, **paused after 1 week idle** |
| Supabase Edge Functions | **2 s CPU**, **150 s wall clock** (free), 256 MB memory, 20 MB script via CLI, 100 functions/project, 500k invocations/mo |
| Cloudflare Pages | 500 builds/mo, 1 concurrent build, 100 projects, 20k files, 25 MiB/file, 100 custom domains |
| OpenRouter | Chat completions only — **no embeddings endpoint**, which is why OpenAI is in the stack |
| OpenAI embeddings | `text-embedding-3-small`, 1536 dims, **$0.02 / 1M tokens** |
| ElevenLabs (this account) | Free, **10,000 chars/month**, non-extendable, one shared credit pool |

Two consequences worth stating plainly. The Supabase 2-project cap is why all seven apps share
one database — never a preference. And 2 s of CPU with 150 s of wall clock is generous enough
that no project in this program needs to design around compute limits; the binding constraints
here are storage and money, not time.

## Architecture

```
Cloudflare Pages — one project, one origin: labs.abdash.net
  └─ /recto  /asksheet  /critiq  /raglab  /graphread  /planemode      (static SPAs)

Supabase — project ref jayflvpyrdvqhmftiokp
  ├─ Postgres + pgvector
  │    platform · recto · raglab · graphread · critiq schemas
  │    (asksheet and planemode own no schema — both persist nothing by design)
  ├─ Auth: anonymous · GitHub · Google · magic link (Resend SMTP on abdash.net)
  ├─ Storage: private per-app buckets
  └─ Edge Functions (Deno)
        ├─ OpenRouter  → chat · vision · structured extraction
        └─ OpenAI      → embeddings
```

The voice concierge is the one exception to the layout: it is an embedded island in the
portfolio site (`abdash.github.io`, served at `abdash.net`), not a standalone SPA. Its backend is
still a Supabase Edge Function, called cross-origin with `abdash.net` allowlisted.

### Why one origin

Supabase persists sessions in `localStorage`, which is per-origin. Seven subdomains would mean
seven separate logins unless a cookie-storage adapter scoped to `.abdash.net` were written and
maintained. Serving every app from a path under one origin makes single sign-on structural: one
anonymous session, one linked identity, seven demos, and no auth code that can get it wrong.

Each SPA builds with `base: '/<app>/'` and gets an SPA fallback rule in `_redirects`. The
accepted cost is that any change rebuilds all seven; at 500 builds a month against a build of a
few minutes, that is not a real constraint.

### Edge Function naming

Supabase Edge Functions share **one flat namespace** across the project — there is no directory
routing. Every function is therefore prefixed with its app:

```
platform-health          recto-ingest        recto-chat        recto-audio-overview
asksheet-plan            critiq-review       raglab-embed      graphread-extract
concierge-turn
```

Nine functions against a limit of 100. Shared helper code lives in `supabase/functions/_shared/`
and is imported rather than copied — CORS headers, JWT extraction, the quota client, and the
OpenRouter and OpenAI wrappers all live there exactly once.

## Repository layout

One public monorepo, npm workspaces:

```
abdash-labs/
├── apps/{recto,asksheet,critiq,raglab,graphread,planemode}/   # Vite + React + TS SPAs
├── packages/
│   ├── platform/     # supabase client, session, auth UI, quota client, Turnstile
│   ├── doc-core/     # pdf.js extraction, chunkers  (recto · raglab · graphread)
│   └── ui/           # design tokens, primitives
├── supabase/
│   ├── functions/    # flat, prefixed, with _shared/
│   └── migrations/   # ONE ordered history for every schema
└── docs/superpowers/{specs,plans}/
```

Seven repositories writing migrations into one shared database would drift within weeks. A single
ordered migration history is the argument that decides the monorepo; shared `platform` and
`doc-core` packages are the dividend — GraphRead genuinely imports Recto's chunker instead of
copying it.

## Data model — shared layer

```
platform.profiles         id → auth.users · display_name · created_at
platform.quota_limits     app · tier · key · value          (tier ∈ 'anon' | 'linked')
platform.usage_counters   user_id · app · key · window_start · count
platform.rate_limits      bucket · window_start · count      (per-IP, unauthenticated paths)
```

`platform.consume_quota(p_app text, p_key text, p_amount int) returns boolean` is a
`SECURITY DEFINER` RPC: it derives the tier from the `is_anonymous` JWT claim, upserts the daily
counter atomically, and returns false when the limit is exceeded. Every app calls it; no app
implements quota logic itself.

Each app owns a Postgres schema. All are added to PostgREST's exposed-schemas list with
`grant usage` to `anon`, `authenticated`, and `service_role`. RLS is enabled on every table with
`owner_id = auth.uid()` across select, insert, update, and delete, plus `with check` on insert.

**Edge Functions use the caller's JWT, not the service role.** Isolation is enforced by Postgres
rather than by remembering to add a `where` clause. ReadLLM v1's IDOR is not patched here; it is
made unrepresentable.

The service role appears in exactly two places, both of which have no caller to act as: the
keep-alive health endpoint, and the concierge's per-IP rate limiter, since concierge visitors are
unauthenticated by construction. Quota enforcement notably does **not** need it — `consume_quota`
is `SECURITY DEFINER`, so it elevates inside Postgres while still being invoked through the
caller's own client, which is what lets it read their tier from their own JWT.

Client reads that carry no server logic — listing notebooks, loading conversation history —
go directly through PostgREST under RLS. An Edge Function is written only where something must
happen that a policy cannot express.

### Budget allocation

500 MB of Postgres and 1 GB of Storage are a shared, finite resource, allocated deliberately:

| Schema | DB | Storage | Notes |
|---|---|---|---|
| recto | 250 MB | — | chunks + embeddings; originals not stored |
| graphread | 50 MB | 50 MB | small JSON graphs + source text |
| critiq | 30 MB | — | findings JSON only; no screenshots since the SEO rescope |
| raglab | 30 MB | 50 MB | **metrics only** — embedding cache is client-side |
| asksheet | 0 | 0 | zero persistence by design |
| planemode | 0 | 0 | no backend at all |
| platform | 10 MB | — | profiles, quotas, counters |
| headroom | 130 MB | 900 MB | |

At 1536 dimensions stored as `halfvec` a chunk costs about 3 KB, roughly 6 KB including HNSW
index overhead, so Recto's 250 MB holds on the order of 41,000 chunks — about 135 hundred-page
documents. `halfvec` rather than `vector` is what makes that number comfortable instead of tight;
the recall difference is below measurement noise.

If storage ever becomes the binding constraint, `text-embedding-3-small` accepts a `dimensions`
parameter and shortens cleanly to 768 (it is Matryoshka-trained), halving the cost again. Not
needed at current budgets, and recorded here so the lever is known rather than rediscovered.

## Model routing

- **OpenRouter** for chat, vision, and structured extraction. One key, one balance, pay-per-use.
- **OpenAI** for embeddings. `text-embedding-3-small` at 1536 dimensions — multilingual, which
  matters for Recto's Arabic and Turkish work, and $0.02 per million tokens, which is about
  $0.001 per hundred-page document.

Model identifiers are never hardcoded. Three Edge Function secrets — `MODEL_CHEAP`,
`MODEL_QUALITY`, `MODEL_VISION` — carry OpenRouter model IDs so the catalog can shift without a
code change, mirroring ReadLLM v1's proven `CHAT_MODEL` pattern. `OPENAI_API_KEY` and
`OPENROUTER_API_KEY` are separate secrets; neither ever reaches a client bundle.

## Auth

Anonymous sign-in on first paint, gated by Cloudflare Turnstile, which Supabase Auth supports as
a native captcha provider. `linkIdentity()` upgrades to GitHub or Google; magic link runs through
Resend SMTP on `abdash.net`. Supabase's built-in email allows **2 messages per hour** and is
explicitly not for production, so custom SMTP is mandatory rather than optional.

Quota tier keys off the `is_anonymous` claim, which makes signing in the reward rather than the
toll:

| | anon | linked |
|---|---|---|
| Recto notebooks | 1 | 3 |
| Recto documents | 3 | 10 |
| Recto messages/day | 20 | 200 |
| Critiq reviews/day | 1 | 3 |
| RAG Lab runs/day | 2 | 10 |
| GraphRead extractions/day | 1 | 5 |
| AskSheet plans/day | 20 | 100 |

Values live in `platform.quota_limits`, editable without a deploy. A scheduled job deletes
anonymous users older than 7 days with no linked identity, cascading their data away — Supabase
does not clean these up automatically.

## Keeping the lights on

Free projects pause after 1 week of inactivity, and a paused demo is worse than no demo. The ping
must come from outside the project, since a paused project cannot wake itself — `pg_cron` is not
an option. A **GitHub Actions scheduled workflow** runs every 3 days against `platform-health`,
which touches Postgres and returns. One cron covers all seven apps, and Actions minutes are free
and unmetered on public repositories.

## Cost

OpenRouter pay-per-use plus a few cents of OpenAI embeddings is the entire recurring spend. With
cheap-tier defaults and the quotas above: a Recto chat turn is about $0.001, a GraphRead 40-page
extraction about $0.03, a full RAG Lab benchmark about $0.03 in embeddings, a Critiq vision
review about $0.04. A $20/month billing alarm is comfortable. The danger is not traffic volume
but defaulting `MODEL_QUALITY` where `MODEL_CHEAP` would serve.

**No project needs a service outside this stack.** Critiq was the one candidate — a design and
accessibility reviewer needs a real browser, which Deno cannot run — and it was rescoped to SEO
and answer-engine review precisely to remove that dependency. It now works from `fetch` and an
HTML parser alone. The stack table above is the complete list of external services.

## Build model

All seven proceed in parallel, after one sequential prerequisite:

1. **The platform layer, alone and first** — monorepo scaffold, `platform` schema and quota RPC,
   auth stack, Turnstile, `_shared/` function helpers, keep-alive workflow, CI, and the Cloudflare
   Pages deploy. Every app depends on it, and nothing built on a wrong foundation is worth
   reviewing.
2. **Then all seven concurrently**, each on its own branch.

Recto stays first among equals — it exercises more platform surface than any other project
(auth, quotas, RLS, embeddings, streaming), so it shakes out the foundation the rest inherit.

## Success criteria

1. One anonymous session, created once, works across all seven apps without re-authenticating.
2. RLS tests prove no user can read, update, or delete another user's row in any app schema.
3. The database stays inside its per-schema budgets under the published quotas.
4. The project never pauses, verified by an intentional 10-day idle window.
5. Total monthly spend stays under the $20 alarm with no manual intervention.

## Decisions taken

- Cloudflare Pages is static hosting only; all backend logic is Supabase Edge Functions.
- OpenRouter for chat and vision, OpenAI for embeddings — forced by OpenRouter having no
  embeddings endpoint, and cheap enough that it costs nothing to be forced.
- One Supabase project, schema per app, shared `platform` schema.
- One origin with path-based apps, so SSO requires no code.
- Monorepo, decided by the single-migration-history argument.
- Caller-JWT database access in Edge Functions; service role confined to the quota RPC.
- Anonymous-first auth with quota tiers as the incentive to link an identity.
