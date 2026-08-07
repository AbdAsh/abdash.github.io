> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-program-overview.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# AI Tab Program — Overview

**Date:** 2026-07-18
**Goal:** Replace the AI tab's three generic capability cards and the "Live AI Demo — Coming Soon" placeholder with seven real, deployed, notable AI projects — each a live app with public source, each demonstrating a different axis of applied AI engineering.

## The lineup and build order

| # | Project | Axis it proves | Spec |
|---|---------|----------------|------|
| 1 | ReadLLM v2 | RAG depth + multi-tenant product engineering | `2026-07-18-readllm-v2-design.md` |
| 2 | Voice portfolio concierge | Realtime voice agents (embedded live demo) | `2026-07-18-voice-concierge-design.md` |
| 3 | AskSheet (spreadsheet agent) | Code-generating agents + client-side compute | `2026-07-18-asksheet-design.md` |
| 4 | Critiq (design & a11y reviewer) | Multimodal + dev-tooling + frontend domain expertise | `2026-07-18-critiq-design.md` |
| 5 | RAG Lab (eval playground) | Evaluation rigor / practitioner credibility | `2026-07-18-rag-lab-design.md` |
| 6 | GraphRead (knowledge-graph explorer) | Structured extraction + graph visualization | `2026-07-18-graphread-design.md` |
| 7 | PlaneMode (offline WebGPU workspace) | On-device inference, zero-server AI | `2026-07-18-planemode-design.md` |

Build strictly one at a time, in this order. Each project gets its own implementation plan (via the writing-plans flow) when its turn comes; specs written today are design contracts, not schedules.

## Shared conventions (all projects)

- **Stack default:** Vite + React + TypeScript SPA on Vercel; Supabase (Postgres + pgvector, Storage, Edge Functions) where a backend is needed. This is the pattern proven by ReadLLM v1 — reuse it unless a spec says otherwise.
- **LLM access is always proxied.** No API key ever ships in a client bundle. Browser → Supabase Edge Function (or Vercel function) → provider. Default text model: `gpt-4o-mini` for cheap paths, `gpt-4.1` where quality matters (override per project via env/secret, mirroring ReadLLM's `CHAT_MODEL` pattern).
- **Every public demo has abuse controls:** per-IP + per-session rate limits, hard per-request token caps, cheap default models, and a monthly provider budget alarm. A portfolio project that gets hugged to death or farmed for free tokens is a liability, not a showcase.
- **Every project ships with:** a public GitHub repo (README with architecture diagram), a live URL, and an AI-tab case-study card (what it is, what it proves, live link + source link, 1 screenshot).
- **IP hygiene:** nothing clones TalentAI/Apex employer functionality. Adjacent domains and opposite-side-of-market framings only; no employer code, prompts, or data.

## AI tab redesign (ships together with project #1)

When ReadLLM v2 goes live, the tab changes from capability cards to project cards:

- Replace the three generic cards with a **project grid** (same glass-card idiom as the Projects tab, but every card links to a live app and its repo — the differentiator, since no current card on the site links anywhere).
- Cards for not-yet-shipped lineup entries render as roadmap stubs ("in build") so the tab is honest but full from day one.
- The "Coming Soon" demo card remains until project #2 replaces it with the embedded voice concierge.
- Housekeeping: `src/components/AiSection.astro` is dead code (the AI panel is inlined in `src/pages/index.astro`) — consolidate to one source of truth during the redesign.

## Cross-project synergies

- **RAG Lab ↔ ReadLLM v2:** RAG Lab's metrics harness is deliberately built so ReadLLM's chunking/retrieval settings can be benchmarked in it; findings feed back as ReadLLM defaults.
- **GraphRead ← ReadLLM:** reuses ReadLLM's client-side extraction/chunking modules (`pdf.js` extract, chunker) as libraries rather than reimplementing.
- **Concierge ← site content:** the concierge's knowledge base is generated from the portfolio site content + CV, and regenerating it is a documented script, not a manual paste.

## Success criteria for the program

1. AI tab shows ≥3 live, clickable projects (with source) by the end of the run — zero "coming soon" text remains.
2. Each project is independently understandable in under a minute from its card + README.
3. Combined monthly run cost across all demos stays within a defined budget cap (default: $20/mo alarm threshold) under normal traffic.

---

# Revision — 2026-08-01

The lineup and the reasoning behind each project's slot are unchanged. The delivery model and the
entire shared stack are replaced. **`2026-08-01-labs-platform-design.md` is now authoritative for
every shared decision**; where this document disagrees with it, that one wins.

## Build order is abandoned

"Build strictly one at a time, in this order" no longer applies. All seven proceed in parallel,
after one sequential prerequisite:

1. **The platform layer, alone and first** — monorepo scaffold, `platform` schema, auth stack,
   quota RPC, Turnstile, keep-alive cron, CI, Cloudflare Pages deploy. Every app depends on it,
   and nothing built on a wrong foundation is worth reviewing.
2. **Then all seven concurrently**, each on its own branch.

Recto stays first among equals — it exercises more platform surface than any other project
(auth, quotas, RLS, embeddings, streaming), so it shakes out the foundation the rest inherit.

## Stack conventions replaced

| Was | Now |
|---|---|
| Vite + React + TS on **Vercel** | Same SPAs on **Cloudflare Pages**, one origin, path-based |
| A Supabase project per app | **One** shared project, schema per app (free tier caps you at 2) |
| Seven public repos | **One public monorepo**, one ordered migration history |
| OpenAI `gpt-4o-mini` / `gpt-4.1` | **OpenRouter**, models behind `MODEL_CHEAP`/`QUALITY`/`VISION` |
| OpenAI `text-embedding-3-small` | **Workers AI `@cf/baai/bge-m3`** — free and multilingual |
| Per-IP limits invented per project | Shared `platform.consume_quota`, anon/linked tiers |

Two conventions from the original survive verbatim and are worth restating because they did the
most work: **no API key ever reaches a client bundle**, and **every public demo has abuse
controls**. The IP-hygiene rule — nothing clones TalentAI/Apex functionality — is likewise
unchanged.

## The AI tab redesign

Still ships with the first live project, but the card grid now points at
`labs.abdash.net/<app>` rather than seven separate domains, and the "one login across every
demo" property is worth saying out loud on the tab — it is the thing that makes seven demos read
as one platform rather than seven weekend projects.

The Coming Soon card is replaced by the voice concierge, whose architecture changed
substantially — see that spec's 2026-08-01 revision. The `src/components/AiSection.astro` dead
code cleanup still stands.

## What verification changed

Checking vendor documentation rather than trusting the July assumptions found one broken project
and one near-miss. The ElevenLabs account is free tier with 10,000 characters per month, which
made the hosted voice agent impossible as designed. RAG Lab's server-side embedding cache would
have consumed the entire shared database in about 45 benchmark runs. Both are corrected in their
specs. Critiq, conversely, got materially easier: Cloudflare's Browser Rendering binding removes
the bundle-size and CPU problems that made it the riskiest project in the lineup.
