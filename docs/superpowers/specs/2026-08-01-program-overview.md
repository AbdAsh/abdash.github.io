# AI Tab Program — Overview

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-ai-tab-program-overview.md`
**Reads with:** `2026-08-01-platform-design.md`, which is authoritative for every shared decision.

**Goal:** Replace the AI tab's three generic capability cards and its "Live AI Demo — Coming Soon"
placeholder with seven real, deployed AI projects — each a live app with public source, each
proving a different axis of applied AI engineering.

## The lineup

| # | Project | Axis it proves | Spec |
|---|---|---|---|
| 1 | **Recto** | RAG depth + multi-tenant product engineering | `2026-08-01-recto-design.md` |
| 2 | **Concierge** | Realtime voice, built rather than rented | `2026-08-01-concierge-design.md` |
| 3 | **AskSheet** | Code-generating agents + client-side compute | `2026-08-01-asksheet-design.md` |
| 4 | **Critiq** | SEO + answer-engine judgment over structured analysis | `2026-08-01-critiq-design.md` |
| 5 | **RAG Lab** | Evaluation rigor / practitioner credibility | `2026-08-01-raglab-design.md` |
| 6 | **GraphRead** | Structured extraction + graph visualization | `2026-08-01-graphread-design.md` |
| 7 | **PlaneMode** | On-device inference, zero server | `2026-08-01-planemode-design.md` |

Together they cover a deliberate range: cloud RAG, realtime voice, proxied inference with local
execution, multimodal analysis, measurement, structured extraction, and fully on-device
inference. No two demonstrate the same thing.

## Build model

Strictly sequential delivery is abandoned. The platform layer ships **first and alone** —
monorepo, `platform` schema, auth, quotas, shared function helpers, CI, deploy — because every
app depends on it and nothing built on a wrong foundation is worth reviewing. After that, all
seven proceed **in parallel**, each on its own branch.

Recto is first among equals. It exercises more platform surface than any other project — auth,
quotas, RLS, embeddings, streaming, storage budgeting — so it is the shakedown for the foundation
the other six inherit.

## Shared conventions

The full stack, budgets, quota tiers, and naming rules live in the platform spec. The four rules
that every project spec is written against:

- **No API key ever reaches a client bundle.** Browser → Supabase Edge Function → provider.
- **Every public demo has abuse controls**: quota tiers through `platform.consume_quota`, hard
  per-request caps, cheap models by default, and a monthly budget alarm. A portfolio project that
  gets hugged to death or farmed for free tokens is a liability, not a showcase.
- **Every project ships with** a live URL under `labs.abdash.net`, public source in the monorepo,
  a README with an architecture diagram, and an AI-tab case-study card.
- **IP hygiene**: nothing clones TalentAI/Apex employer functionality. Adjacent domains and
  opposite-side-of-market framings only; no employer code, prompts, or data.

## AI tab redesign

Ships with the first live project. The three generic capability cards become a project grid using
the same glass-card idiom as the Projects tab — but every card links to a live app and its source,
which no current card on the site does. Not-yet-shipped entries render as honest "in build" stubs
so the tab is full from day one without lying.

Worth saying out loud on the tab: **one login works across every demo.** That property is what
makes seven projects read as one platform rather than seven weekend builds.

The Coming Soon card is replaced by the concierge. Housekeeping:
`src/components/AiSection.astro` is dead code — the AI panel is inlined in `src/pages/index.astro`
— and gets consolidated to one source of truth during the redesign.

## Cross-project synergies

These are real dependencies in a monorepo, not aspirations:

- **`packages/doc-core`** — pdf.js extraction and chunkers, imported by Recto, RAG Lab, and
  GraphRead. GraphRead passes a coarser chunk size as a parameter rather than forking the code.
- **RAG Lab ↔ Recto** — RAG Lab's harness benchmarks Recto's chunking and retrieval settings;
  the winning configuration becomes Recto's default, with the permalink cited as evidence.
- **Concierge ← everything** — its knowledge dossier is generated from site content, the CV, and
  one paragraph per project by a script, so "ask it about Recto" works and stays current.

## Program success criteria

1. The AI tab shows at least three live, clickable projects with source by the end of the run,
   and zero "coming soon" text remains.
2. Each project is understandable in under a minute from its card plus README.
3. One account works across all seven demos.
4. Combined monthly cost stays under the $20 alarm under normal traffic.

## What verification changed

Checking vendor documentation rather than trusting the July assumptions found one project broken
outright and one near-miss:

- **The concierge** was designed on ElevenLabs Agents. The account is free tier, 10,000 characters
  a month, non-extendable — about two conversations before the widget would show its "resting"
  state permanently. The voice loop is now built in-house on the Web Speech API, which costs
  nothing and is the stronger engineering claim.
- **RAG Lab** specified a server-side embedding cache that would have consumed the entire shared
  500 MB database in roughly 45 benchmark runs. The cache moved to IndexedDB.
- **Critiq** was a design and accessibility reviewer, which needs a real browser that Deno cannot
  run — the only third-party dependency in the whole program. It was rescoped to **SEO and
  answer-engine review**, which needs nothing but `fetch` and an HTML parser. That removed the
  vendor, the screenshot storage budget, and the vision-model cost in one move, and landed on a
  domain that is arguably more current and more differentiating than the original.

All three corrections are in the respective specs. The full record of what was superseded and why
is in `archive/README.md`.
