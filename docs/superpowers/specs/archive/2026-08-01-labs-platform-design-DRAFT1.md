> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-platform-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# Labs Platform — Design

**Date:** 2026-08-01
**Status:** Authoritative for all shared decisions. Where a project spec disagrees with this
document, this document wins.
**One-liner:** One monorepo, one Cloudflare Pages origin, one Supabase project, one login —
hosting seven AI demos that share a platform layer instead of reimplementing it seven times.

## Why this document exists

The seven project specs written 2026-07-18 each assumed a dedicated Supabase project, a Vercel
deployment, an OpenAI key, and sequential delivery. All four assumptions are now wrong. Rather
than duplicate the correction into seven files, the shared substrate is specified once here and
each project spec defers to it.

## Verified constraints

Every number below was checked against vendor documentation on 2026-08-01, not recalled.

| Platform | Free-tier limit that shapes the design |
|---|---|
| Supabase | **2 active projects**, 500 MB Postgres, 1 GB Storage, 50k MAU, 500k edge invocations, **paused after 1 week of inactivity** |
| Cloudflare Pages | 500 builds/month, 1 concurrent build, 100 projects, 20k files, 25 MiB/file, 100 custom domains |
| Cloudflare Workers | 100k requests/day, **10 ms CPU per invocation**, 128 MB memory, 3 MB script, 50 subrequests, no wall-clock limit |
| Workers AI | **10,000 Neurons/day**, reset 00:00 UTC |
| Browser Rendering | **10 min/day**, 3 concurrent sessions, 1 new instance/20 s, 60 s timeout, Playwright supported |
| OpenRouter | Chat completions only — **no embeddings endpoint** |
| ElevenLabs (this account) | Free tier, **10,000 characters/month**, `can_extend_character_limit: false`, one shared credit pool across all products |

Two consequences worth stating plainly. The Supabase 2-project cap is why all seven apps share
one database — it was never a preference. And the 10 ms Workers CPU limit is the sharpest
constraint in the stack; it is the reason chunking stays client-side and ingest batches shrink.

## Architecture

```
Cloudflare Pages — one project, one origin: labs.abdash.net
  ├─ /recto  /asksheet  /critiq  /raglab  /graphread  /planemode   (static SPAs)
  └─ functions/api/**  (Pages Functions, Workers runtime)
        ├─ OpenRouter            → chat · vision · structured extraction
        ├─ Workers AI (binding)  → @cf/baai/bge-m3 embeddings
        └─ Browser Rendering     → Critiq capture only
Supabase (free) — project ref jayflvpyrdvqhmftiokp
  ├─ Postgres + pgvector: platform · recto · raglab · graphread · critiq schemas
  │    (asksheet and planemode own no schema — both persist nothing by design;
  │     asksheet uses platform.consume_quota only)
  ├─ Auth: anonymous · GitHub · Google · magic link (Resend SMTP on abdash.net)
  └─ Storage: per-app private buckets
```

The voice concierge is the exception: it is an embedded island in the portfolio site
(`abdash.github.io`, served at `abdash.net`), not a standalone SPA. Its proxy endpoints live in
this monorepo at `/api/concierge/*` and are called cross-origin with `abdash.net` allowlisted.

### Why one origin

Supabase persists sessions in `localStorage`, which is per-origin. Seven subdomains would mean
seven separate logins unless a cookie-storage adapter scoped to `.abdash.net` were written and
maintained. Serving all apps from paths under one origin makes single sign-on structural: one
anonymous session, one linked identity, seven demos, no auth code to get wrong. Each SPA builds
with `base: '/<app>/'` and gets a `_redirects` SPA fallback.

The accepted cost is that any change rebuilds all seven apps. At 500 builds/month against a
build that takes single-digit minutes, this is not a real constraint.

### Why Cloudflare's file-based functions matter

Supabase Edge Functions share one flat namespace, which would have forced `recto-chat`,
`asksheet-plan` prefixes. Pages Functions map directory structure to routes, so
`functions/api/recto/chat.ts` serves `/api/recto/chat` and namespacing is free.

Supabase Edge Functions remain available and are held in reserve for any path that proves too
CPU-heavy for Workers' 10 ms budget — Deno gives materially more headroom. Nothing is planned
there at the outset.

## Repository layout

One public monorepo, npm workspaces:

```
abdash-labs/
├── apps/{recto,asksheet,critiq,raglab,graphread,planemode}/   # Vite + React + TS SPAs
├── packages/
│   ├── platform/     # supabase client, session, auth UI, quota client, Turnstile
│   ├── doc-core/     # pdf.js extraction, chunkers  (recto · raglab · graphread)
│   └── ui/           # design tokens, primitives
├── functions/api/**  # Cloudflare Pages Functions
├── supabase/migrations/   # ONE ordered history for every schema
└── docs/superpowers/{specs,plans}/
```

Seven repositories writing migrations into one shared database would drift within weeks. A
single ordered migration history is the argument that decides the monorepo, and the shared
`platform` and `doc-core` packages are the dividend — GraphRead genuinely imports Recto's
chunker rather than copying it.

## Data model — shared layer

```
platform.profiles         id → auth.users · display_name · created_at
platform.quota_limits     app · tier · key · value          (tier ∈ 'anon' | 'linked')
platform.usage_counters   user_id · app · key · window_start · count
platform.rate_limits      bucket · window_start · count      (per-IP, for unauthenticated paths)
```

`platform.consume_quota(p_app text, p_key text, p_amount int) returns boolean` is a
`SECURITY DEFINER` RPC: it derives the tier from the `is_anonymous` JWT claim, upserts the
daily counter atomically, and returns false when the limit is exceeded. Every app calls it;
no app implements quota logic itself.

Each app owns a Postgres schema. All schemas are added to PostgREST's exposed list, with
`grant usage` to `anon`, `authenticated`, and `service_role`. RLS is enabled on every table with
`owner_id = auth.uid()` for select, insert, update, and delete, plus `with check` on insert.

**Functions use the caller's JWT, not the service role.** Isolation is enforced by Postgres,
not by remembering to add a `where` clause. The service role appears in exactly one place —
the quota RPC. ReadLLM v1's IDOR is not patched here; it is made unrepresentable.

### Budget allocation

The 500 MB database and 1 GB bucket are a shared, finite resource. Allocated deliberately:

| Schema | DB budget | Storage | Notes |
|---|---|---|---|
| recto | 250 MB | — | chunks + embeddings; no originals stored |
| graphread | 50 MB | 50 MB | small JSON graphs + source text |
| critiq | 30 MB | 400 MB | findings JSON in DB, screenshots in bucket |
| raglab | 30 MB | 50 MB | **metrics only** — embedding cache is client-side |
| asksheet | 0 | 0 | zero persistence by design |
| planemode | 0 | 0 | no backend at all |
| platform | 10 MB | — | profiles, quotas, counters |
| headroom | 130 MB | 500 MB | |

At bge-m3's 1024 dimensions stored as `halfvec`, a chunk costs roughly 4 KB including index
overhead, so Recto's 250 MB holds about 62,000 chunks — on the order of 200 hundred-page
documents. Comfortable.

## Model routing

- **Chat, vision, structured extraction → OpenRouter**, pay-per-use credits, one key.
- **Embeddings → Workers AI `@cf/baai/bge-m3`** via binding. Free, multilingual, 60k token
  context. This is a genuine upgrade over the previously specced `text-embedding-3-small` for
  Recto's Arabic/Turkish work, and it costs nothing.

Model identifiers are never hardcoded. Three environment variables — `MODEL_CHEAP`,
`MODEL_QUALITY`, `MODEL_VISION` — carry OpenRouter model IDs, so the catalog can shift without
a code change. This mirrors ReadLLM v1's proven `CHAT_MODEL` pattern.

**Two numbers to measure, not assume.** bge-m3's Neuron cost per 1k tokens decides whether
10,000/day is generous or tight, and its output dimension must be confirmed against a live call
before the migration is written (BGE-M3 is 1024-dim dense, but the migration should not be built
on recollection). If Neurons prove tight, the fallback is OpenAI `text-embedding-3-small` at
$0.02/1M tokens — roughly $0.001 per hundred-page document.

## Auth

Anonymous sign-in on first paint, gated by Cloudflare Turnstile (free, and native to the stack
we are already on). `linkIdentity()` upgrades to GitHub or Google; magic link runs through Resend
SMTP on `abdash.net`. Supabase's built-in email is capped at **2 messages per hour** and is
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

Values live in `platform.quota_limits` and are editable without a deploy. A scheduled job
deletes anonymous users older than 7 days with no linked identity, cascading their data away —
Supabase does not clean these up automatically.

## Keeping the lights on

A Cloudflare Cron Trigger fires every 3 days against a trivial endpoint that touches Postgres.
Free projects pause after 1 week of inactivity, and a paused demo is worse than no demo. One
cron covers all seven apps.

## Cost

OpenRouter pay-per-use is the only recurring spend. With cheap-tier defaults and the quotas
above: a Recto chat turn is about $0.001, a GraphRead 40-page extraction about $0.03, a full
RAG Lab benchmark about $0.03, a Critiq vision review about $0.04. Embeddings are free via
Workers AI. A $20/month billing alarm is comfortable; the danger is not volume but defaulting
`MODEL_QUALITY` where `MODEL_CHEAP` would do.

Two optional $5/month upgrades, both deferred until measurement justifies them: Workers Paid
(lifts the 10 ms CPU ceiling to 30 s, relevant only if Critiq's screenshot handling exceeds it)
and ElevenLabs Starter (only if voice quality becomes a priority — see the concierge revision).

## Build model

Sequential delivery is abandoned. All seven proceed in parallel, but not from a standing start:

1. **Platform first, and alone.** Monorepo scaffold, migrations for `platform`, auth stack,
   quota RPC, Turnstile, keep-alive cron, CI, and the Pages deploy. Nothing else can be correct
   until this is, and every app depends on it.
2. **Then all seven in parallel**, each on its own branch against the shared platform.

Recto remains first among equals: it exercises the most platform surface (auth, quotas, RLS,
embeddings, streaming) and is the shakedown for everything the others rely on.

## Success criteria

1. One anonymous session, created once, works across all seven apps without re-authenticating.
2. RLS tests prove no user can read, update, or delete another user's row in any app schema.
3. The database stays inside its per-schema budgets under the published quotas.
4. The project never pauses; the keep-alive is verified by an intentional 10-day idle window.
5. Total monthly spend stays under the $20 alarm with no manual intervention.

## Decisions taken

- One Supabase project, schema per app, shared `platform` schema. Forced by the 2-project cap,
  but correct regardless.
- One Cloudflare Pages origin with path-based apps, so SSO requires no code.
- Monorepo, decided by the single-migration-history argument.
- OpenRouter for chat, Workers AI bge-m3 for embeddings, no OpenAI account.
- Caller-JWT database access in functions; service role confined to the quota RPC.
- Anonymous-first auth with quota tiers as the incentive to link an identity.
