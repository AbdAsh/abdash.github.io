# Critiq — AI SEO & Answer-Engine Reviewer — Design

**Date:** 2026-08-01 (revised same day: design/a11y → SEO)
**Supersedes:** `archive/2026-07-18-critiq-design.md`
**Depends on:** `2026-08-01-platform-design.md`
**One-liner:** Paste a URL and get the SEO review a senior practitioner would write — crawlability,
metadata, content-intent fit, semantics, structured data, and whether an AI answer engine can
actually cite you — with concrete fixes, as a shareable report.

## Why the scope changed

The design-and-accessibility version required a real browser: screenshots at two viewports and
axe-core executed in-page. Deno cannot run Chromium, so it needed a third-party browser service —
the only such dependency in the entire program, plus a storage budget for screenshots and a
vendor account to maintain.

SEO review needs **no browser at all.** Everything of value comes from the HTTP response, the raw
HTML, `robots.txt`, and `sitemap.xml`. Critiq becomes a pure `fetch`-and-parse tool inside a
Supabase Edge Function: no extra vendor, no screenshots, no 400 MB of storage, and a run that
costs one HTTP round trip plus one LLM call.

## Why it's notable

Every SEO scanner on the market checks whether a title tag *exists*. None can tell you the title
is generic, the H1 promises something the body never delivers, the page targets an intent it
doesn't answer, or the internal linking buries the page that should rank.

The second half is more current and more differentiating: **answer-engine readiness**. As search
shifts toward AI-generated answers, "is this page structured so a model can extract and cite a
correct claim from it?" is a question practitioners are actively asking and almost no tool
answers. That is a judgment problem, which is exactly what an LLM adds over a rule engine — and
it is a domain the author already works in.

## The JS-rendering limitation is a feature

Fetching raw HTML means a client-rendered SPA returns an near-empty shell. That is not a gap in
the tool — **it is one of the most valuable findings it can produce.** A page whose content is
invisible without JavaScript execution has a real, severe, and frequently unnoticed SEO problem,
and Critiq reports it as a critical finding with the evidence: script count, DOM text length,
text-to-HTML ratio.

## Goals

1. URL in → structured review out, grouped by dimension, each finding carrying severity,
   evidence, and a concrete fix with code where applicable.
2. **Hybrid analysis**: deterministic checks are authoritative for mechanics; the LLM is credited
   only with judgment. Findings are labeled by source and deduplicated, so a mechanical result is
   never re-served as an "insight."
3. Answer-engine readiness assessed as a first-class dimension, not an afterthought.
4. Shareable, permalinked reports — the report markets the tool.
5. Safe to run against the open web from a public form: SSRF-hardened and rate-limited.

## Non-goals

- Multi-page crawls in v1. Single URL per run; phase 2 does up to five same-origin pages.
- Rank tracking, keyword volume, or backlink data. Those need paid data vendors; Critiq reviews a
  page, it does not report on a market.
- Rendering JavaScript. Explicitly out of scope, and reported as a finding when it matters.
- Competitive comparison in v1 (phase 2 candidate).

## Dimensions reviewed

| Dimension | Mechanical checks | LLM judgment |
|---|---|---|
| Crawlability & indexing | status, redirect chain, `robots.txt` rules, robots meta, `X-Robots-Tag`, canonical, sitemap presence and inclusion | whether canonical choice is coherent |
| Metadata & SERP presentation | title/description presence, length, duplication; OG and Twitter cards | is the title compelling and specific; does the description earn a click |
| Content & intent | word count, text-to-HTML ratio, thin-content detection | what intent does this target, and does it answer it |
| Structure & semantics | heading tree validity, single H1, image alt coverage, `lang`, `viewport`, `hreflang` | does the heading outline reflect a real argument |
| Links | internal/external counts, nofollow, empty anchors, generic anchor text | is internal linking sensible for this page's role |
| Structured data | JSON-LD presence, parse validity, type detection | is the chosen schema type appropriate and complete |
| **Answer-engine readiness** | extractable Q&A blocks, list/table density, claim-with-source patterns, entity clarity | could a model quote a correct, self-contained claim from this page and attribute it |

## Architecture

```
Vite + React + TS SPA → Cloudflare Pages at labs.abdash.net/critiq
  └─ POST → Supabase Edge Function `critiq-review`
        ├─ SSRF guard — before any request leaves
        ├─ platform.consume_quota('critiq','reviews',1)
        ├─ fetch(url): ≤3 redirects, chain recorded, 15 s timeout, size cap,
        │              status + headers + timing captured
        ├─ fetch robots.txt and sitemap.xml (same origin, best-effort)
        ├─ parse HTML with deno-dom → digest:
        │     title · description · canonical · robots · OG/Twitter · lang · hreflang ·
        │     viewport · heading tree · image alts · links · JSON-LD · word count ·
        │     text:HTML ratio · script count
        ├─ deterministic checks over the digest → findings[source:'check']
        ├─ OpenRouter MODEL_QUALITY: digest + extracted main text
        │     → strict JSON findings[source:'llm']
        ├─ merge/dedupe — checks win on mechanics
        └─ persist → critiq.reports → slug URL
```

**Model:** `MODEL_QUALITY`, text-only. No vision model needed now, which makes a review roughly
$0.01 rather than $0.04. Judgment quality still matters more than cost, since runs are scarce.

**Report page:** overall grade plus a letter grade per dimension, findings filtered by severity,
each with evidence rendered as the actual offending markup and a copyable fix. Public by default
at `/critiq/r/<slug>`; the submitter is told before running.

## Security, cost & abuse controls

Critiq fetches attacker-supplied URLs from our infrastructure, so the SSRF guard remains a
first-class requirement rather than hardening — and with a raw `fetch` it is the *only* thing
standing between a submitted URL and our network:

- http(s) only, ports 80/443. Hostname resolved and checked against private and reserved ranges —
  RFC1918, loopback, link-local, and cloud metadata addresses — **before and at connection time**,
  so DNS rebinding is caught. Redirects revalidated per hop, maximum 3.
- 15 s timeout, response size cap, and non-HTML content types rejected early.
- Quota tiers: 1 review/day anonymous, 3/day linked, plus a global daily cap. One LLM call per run
  with a hard token ceiling. Reports cached by (URL, day), so resubmitting the same page is free.
- Reports carry `noindex`, and any report can be deleted by slug, so Critiq never becomes a
  name-and-shame surface.

The **automated SSRF test suite** — localhost, `169.254.169.254`, private ranges, redirect tricks,
simulated DNS rebinding — is a phase-1 deliverable.

## Data model — `critiq` schema

```
critiq.reports   id · slug · owner_id · url · status · grades jsonb ·
                 findings jsonb · digest jsonb · created_at
```

RLS: owners read, update, and delete their own rows; a second policy grants public read of
**completed reports by slug only**, which makes permalinks shareable without exposing a
submitter's history.

**Budget: 30 MB Postgres, and no storage allocation at all.** Dropping screenshots returns 400 MB
to the shared bucket.

## Delivery phases

1. **Phase 1** — submit → fetch and parse → deterministic checks → LLM judgment → merged findings
   → persisted shareable report; SSRF guard with its test suite; quotas; deploy with sample
   reports including a self-audit of `abdash.net`.
2. **Phase 2** — up to five same-origin pages per run, compare-two-runs diff, competitor
   side-by-side, CSV/markdown export.

## Success criteria

- Run against ten diverse real sites: every run completes or fails honestly; at least 80% of LLM
  findings judged fair and actionable on manual review; zero duplicated check/LLM findings.
- A client-rendered SPA produces the "content invisible without JavaScript" critical finding with
  correct supporting evidence.
- The SSRF test suite passes with every vector blocked.
- A report page makes sense to a non-author in under a minute and renders well shared into Slack
  or LinkedIn, with OG tags carrying the graded summary.
- Launch content: a Critiq report of `abdash.net` itself, linked from the AI-tab card — self-audit
  as proof of confidence, and any findings it raises get fixed.

## Decisions taken

- **SEO and answer-engine review, not design and accessibility** — the scope change that removes
  the browser dependency, the third-party vendor, and the storage budget in one move.
- Name **Critiq** retained; the word still fits.
- Raw `fetch` plus `deno-dom`. No JavaScript rendering, with non-rendering reported as a finding.
- Deterministic checks authoritative for mechanics; the LLM credited only with judgment.
- `MODEL_QUALITY` text-only, roughly $0.01 a review.
- Public-by-default reports with `noindex`, cache-by-day, quota tiers of 1 and 3 per day.
