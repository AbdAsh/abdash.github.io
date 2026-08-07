> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-critiq-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# Critiq — AI Design & Accessibility Reviewer — Design

**Date:** 2026-07-18
**One-liner:** Paste a URL and get a senior-frontend-quality review: semantic accessibility issues automated scanners can't judge, design critique with evidence, and concrete code-level fixes — as a shareable report.

## Why it's notable

Lighthouse and axe catch *mechanical* failures (missing alt, low contrast ratios). They cannot tell you that the alt text is meaningless, the focus order is illogical, the visual hierarchy buries the primary action, or the error copy is hostile. Critiq layers a vision LLM + DOM analysis on top of an axe-core pass to produce the review a senior frontend engineer would write — which is exactly the author's profession, making this the most on-brand artifact in the lineup: AI engineering *and* frontend judgment in one tool.

## Goals

1. URL in → structured review out: findings grouped by dimension (hierarchy & layout, typography, color & contrast, a11y semantics, interaction affordances, copy), each with severity, evidence, and a concrete fix (CSS/HTML where applicable).
2. Two viewports per run: desktop (1440) and mobile (390) — responsive failures are half the value.
3. Hybrid analysis: axe-core automated findings folded in and *deduplicated* against LLM findings, labeled by source, so the report never repeats a mechanical finding as an "insight."
4. Shareable, permalinked report pages — the report itself markets the tool.
5. Safe to run against the open web from a public form (SSRF-hardened, rate-limited).

## Non-goals

- Multi-page crawls in v1 (single URL per run; phase 2).
- Authenticated pages, pages behind consent walls (best-effort banner dismissal only).
- Automated re-checks / monitoring over time (phase 2 idea: diff two runs).
- Guaranteed pixel-perfect capture of heavy WebGL/canvas sites — documented limitation.

## Architecture

```
Vite + React + TS SPA (Vercel) — submit form + report viewer
  └─ POST /api/review (Vercel Function, Node)
        ├─ SSRF guard (see security) → Playwright-core + @sparticuz/chromium
        │     ├─ capture: full-page screenshots @1440 & @390 (capped height)
        │     ├─ DOM digest: landmarks, heading tree, links/buttons + accessible names,
        │     │   form fields + labels, image alts, tab-order sample, meta
        │     └─ axe-core run in-page → mechanical findings
        ├─ Vision+text LLM call: screenshots + DOM digest + axe summary
        │     → strict JSON findings schema (dimension, severity, evidence, selector?, fix, code?)
        ├─ merge/dedupe (axe IDs matched against LLM claims; axe wins on mechanics)
        └─ persist report JSON + screenshots → Supabase (reports table + storage) → slug URL
```

- **Runtime decision:** Vercel Functions with `@sparticuz/chromium` (proven pattern, no extra vendor). Capture+analyze budget fits comfortably in a 60s function; if a target page is slower than that, the run fails with an honest timeout message. Queueing infrastructure is deliberately out of scope — concurrency is capped instead (one active run per visitor, small global cap via a Supabase counter).
- **Model:** vision-capable default `gpt-4.1` (screenshot judgment quality matters more than cost here — runs are rate-limited scarce, not chatty); Claude Sonnet noted as drop-in alternative behind the same JSON schema.
- **Report page:** screenshots with finding markers (positioned via element bounding boxes captured at snapshot time), findings list with severity filter, per-finding code fix block, overall summary paragraph + letter grade per dimension. Public by default at `critiq.../r/<slug>` (submitter is told before running).

## Security, cost & abuse controls

This tool fetches attacker-supplied URLs from our infrastructure — the SSRF guard is a first-class requirement, not hardening:

- URL must be http(s), port 80/443; hostname resolved and **checked against private/reserved ranges (RFC1918, loopback, link-local, cloud metadata IPs) before and at connection time** (DNS-rebinding aware: validate the resolved IP actually connected to); redirects re-validated per hop, max 3.
- Browser context: JavaScript enabled but downloads, dialogs, and non-http(s) schemes blocked; 15s navigation timeout; response size caps.
- Spend controls: N runs per IP per day (default 3), global daily run cap, one LLM call per run with a hard token ceiling. Reports are cached by (URL, viewport, day) so repeat submissions of the same page are free.
- Content: reports of clearly illegal/abusive target content can be deleted by slug; no indexing (`noindex` on report pages) to keep Critiq from becoming a name-and-shame surface.

## Portfolio integration

- Repo `critiq` (public); live URL critiq.vercel.app (fallback name `critiq-app` if taken). AI-tab card shows a real report of a well-known site as the thumbnail.
- Launch content: a report of **abdash.net itself**, linked from the card — self-audit as proof of confidence (and any findings it raises get fixed, which is a nice story).

## Delivery phases

1. **Phase 1 (single implementation plan):** submit → capture (2 viewports) → axe + LLM review → merged findings → persisted shareable report; SSRF guard + rate limits; deploy with sample reports.
2. **Phase 2:** finding markers overlaid interactively on screenshots, PDF export, compare-two-runs diff, small crawl (up to 5 same-origin pages).

## Success criteria

- Run against 10 diverse real sites: every run completes or fails honestly; ≥80% of LLM findings judged "fair and actionable" on manual review; zero duplicated axe/LLM findings in reports.
- SSRF test suite (localhost, 169.254.169.254, private ranges, redirect tricks, DNS rebind simulation) fully blocked — encoded as automated tests.
- A report page makes sense to a non-author in under a minute and renders well when shared into Slack/LinkedIn (OG tags with the graded summary).
- Month of public availability stays under budget with zero manual babysitting.

## Decisions taken (override if you disagree)

- Name **Critiq**; Vercel Functions + @sparticuz/chromium (no Browserless dependency); `gpt-4.1` vision default.
- Public-by-default reports with noindex; cache-by-day; 3 runs/IP/day.
- axe-core is authoritative for mechanical findings; the LLM is only credited with judgment findings.

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`. Critiq was the highest-risk project in the
lineup under the Vercel plan. The move to Cloudflare removes the risk almost entirely.

## What the Vercel plan was going to cost

Verified before the platform changed: `playwright-core` (~5 MB) plus `@sparticuz/chromium`
(~40 MB) lands near Vercel's 50 MB function limit with no headroom, with the standard escape
hatch being `@sparticuz/chromium-min` and an externally hosted binary. Vercel Hobby also allots
4 CPU-hours per month **across the whole account**, and a Chromium launch with two viewport
captures burns 15–30 CPU-seconds per run.

## The replacement: Cloudflare Browser Rendering

Chromium becomes a platform binding rather than a bundled dependency. **Playwright is officially
supported.** No bundle-size fight, no CPU-hour ceiling, no `chromium-min` workaround.

Verified free-tier limits: **10 minutes per day**, 3 concurrent sessions, **one new instance
every 20 seconds**, 60-second default timeout (extensible to 10 minutes via `keep_alive`).

A two-viewport capture runs 20–40 seconds, so the daily allowance is roughly **15–30 reviews per
day** — comfortably above the 3-runs-per-IP cap the spec already wanted, and it makes the global
daily cap a real number instead of a guess.

The **one-instance-per-20-seconds throttle is the new constraint**, and it is a queueing problem
the original spec explicitly declined to solve. It does not need infrastructure: the existing
"one active run per visitor" rule plus a `platform.rate_limits` counter gating instance
acquisition is sufficient. A visitor who arrives during the throttle window waits with honest
feedback rather than failing.

## Screenshots must shrink

Two full-page PNGs at 1–3 MB each would consume the shared 1 GB Supabase bucket within a month.
Revised: capture to **WebP, downscaled to ~800 px wide, height-capped** — roughly 150 KB each.
Against the 400 MB allocation that is over a thousand reviews. Add a retention policy that drops
screenshots after 30 days while keeping the findings JSON permanently, so old report permalinks
degrade to text rather than breaking.

## Remaining risk: the 10 ms CPU budget

Workers free allows 10 ms CPU per invocation. Awaiting a browser is I/O and costs nothing, but
moving multi-megabyte screenshot buffers through the Worker might not fit. Mitigation, in order:
stream captures directly to Supabase Storage without buffering; if that still exceeds the budget,
**Workers Paid at $5/month lifts the ceiling to 30 seconds** and closes the question. Measure
before paying.

## Other changes

- **Hosting:** `labs.abdash.net/critiq`, reports at `/critiq/r/<slug>`.
- **Model:** OpenRouter `MODEL_VISION`. The spec's reasoning — that judgment quality matters more
  than cost because runs are scarce and rate-limited — still holds.
- **Quotas:** 1 review/day anonymous, 3/day linked, via `platform.consume_quota`, replacing the
  per-IP-only scheme.
- **Budget:** 30 MB Postgres for findings, 400 MB Storage for screenshots.

## Unchanged and still first-class

The SSRF guard. Critiq fetches attacker-supplied URLs, and running inside Cloudflare's network
rather than Vercel's changes nothing about that obligation: http(s) only, ports 80/443, resolved
IP checked against private and reserved ranges before and at connection time, DNS-rebinding aware,
redirects revalidated per hop with a max of 3. The automated SSRF test suite remains a phase-1
deliverable, not hardening.

Also unchanged: axe-core authoritative for mechanical findings, dedupe against LLM claims,
`noindex` on report pages, deletion by slug, and the abdash.net self-audit as launch content.
