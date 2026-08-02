# Archived specs — will not be implemented

Nothing in this folder is a build target. Every document here has been superseded by a
`2026-08-01-*` spec in the parent directory. They are kept because the *reasoning* in them is
often still good — the product thinking largely survived — but their stack, hosting, and
delivery assumptions are wrong, and implementing from them would produce the wrong system.

## The July 18 batch — wrong on four shared assumptions

| Archived | Replaced by |
|---|---|
| `2026-07-18-ai-tab-program-overview.md` | `2026-08-01-program-overview.md` |
| `2026-07-18-readllm-v2-design.md` | `2026-08-01-recto-design.md` |
| `2026-07-18-voice-concierge-design.md` | `2026-08-01-concierge-design.md` |
| `2026-07-18-asksheet-design.md` | `2026-08-01-asksheet-design.md` |
| `2026-07-18-critiq-design.md` | `2026-08-01-critiq-design.md` |
| `2026-07-18-rag-lab-design.md` | `2026-08-01-raglab-design.md` |
| `2026-07-18-graphread-design.md` | `2026-08-01-graphread-design.md` |
| `2026-07-18-planemode-design.md` | `2026-08-01-planemode-design.md` |

All eight assumed: **a dedicated Supabase project per app** (the free plan allows 2 total),
**Vercel hosting**, **an OpenAI key for both chat and embeddings**, and **strictly sequential
delivery, one project at a time**. All four were overturned.

Two of them were also wrong on their own terms, which only surfaced when the vendor
documentation was actually checked rather than recalled:

- **Voice concierge** was designed around ElevenLabs Agents. The account is free tier with
  10,000 characters per month and no extension available — roughly two conversations before the
  widget would show its "resting" state permanently. The hosted-agent architecture was not
  viable at any traffic level.
- **RAG Lab** specified a server-side embedding cache. At ~11 MB per twelve-config benchmark,
  about 45 runs would have consumed the entire 500 MB database that all seven apps share.

## The two same-day drafts

`2026-08-01-labs-platform-design-DRAFT1.md` and `2026-08-01-recto-design-DRAFT1.md` were written
and superseded on the same day. They correctly moved the program to Cloudflare Pages, a shared
Supabase project, a monorepo, and OpenRouter — all of which carried forward. They were wrong
about where backend code runs:

- They put backend logic in **Cloudflare Pages Functions** (Workers runtime) rather than
  **Supabase Edge Functions**. This mattered concretely: Workers' free tier allows 10 ms CPU per
  invocation, so those drafts shrank ingest batches, worried about screenshot buffers, and
  budgeted around a limit that does not exist in the real stack. Supabase Edge Functions allow
  **2 s CPU and 150 s wall clock** — two hundred times the headroom — and every constraint
  derived from the 10 ms figure was deleted from the replacements.
- They used **Workers AI `@cf/baai/bge-m3`** for embeddings, chosen because OpenRouter has no
  embeddings endpoint. Embeddings now come from **OpenAI** directly, which also removes two
  unknowns those drafts had to defer: bge-m3's output dimension and its per-token Neuron cost.
  `text-embedding-3-small` is definitively 1536 dimensions at $0.02/1M tokens.
- Consequently they also assumed Cloudflare's file-based function routing, which removed the
  need for name prefixes. Supabase Edge Functions share one flat namespace, so the replacements
  restore `recto-chat`, `asksheet-plan`, and similar prefixing.

The knock-on effect worth knowing: DRAFT1 solved Critiq's browser problem with Cloudflare's
Browser Rendering binding, which is only available inside Workers. Moving the backend to Supabase
removed that option, and rather than add a third-party browser service, **Critiq was rescoped
from design-and-accessibility review to SEO and answer-engine review** — a domain that needs only
`fetch` and an HTML parser. The archived July Critiq spec is therefore doubly superseded: wrong
stack *and* wrong subject.
