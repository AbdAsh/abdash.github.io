> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-planemode-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# PlaneMode — Offline WebGPU AI Workspace — Design

**Date:** 2026-07-18
**One-liner:** A PWA that runs a small LLM entirely in the browser via WebGPU — chat, translate, and summarize with zero server, zero API, zero network. Install it, switch on airplane mode, it still works.

## Why it's notable

"There is no server" is a story every audience gets instantly — engineers respect the WebGPU/WebLLM plumbing, everyone else respects "my words never leave this device" and "it works on a plane." It is the only project in the lineup with literally zero marginal cost and zero abuse surface, and it completes the portfolio's range: cloud RAG (ReadLLM) → proxied inference (AskSheet) → fully on-device (PlaneMode).

## Goals

1. Chat with a small instruct model running fully client-side (WebLLM / MLC), streaming tokens at usable speed on ordinary hardware.
2. Two task modes beyond chat, chosen because they're what people actually need offline: **Translate** (incl. English↔Turkish↔Arabic — the author can verify quality personally) and **Summarize** (paste text → tight summary). Both are prompt templates over the same engine, not separate systems.
3. True offline PWA: after first load + model download, everything — app shell *and* weights — serves from local storage with the network off.
4. Honest hardware UX: detect WebGPU + approximate memory, recommend a model tier, show download size *before* downloading, and degrade gracefully on unsupported browsers.
5. Conversations persist locally (IndexedDB) with an export/wipe control — private by architecture, legible as such.

## Non-goals

- Matching cloud-model quality — the UI is honest that this is a small model; the point is where it runs, not benchmark supremacy.
- RAG/document upload (ReadLLM's job; a phase-2 "offline notes search" idea is parked deliberately).
- Server-side anything: no analytics beyond a privacy-respecting page counter on the *landing* page only, no accounts, no telemetry from the app itself.
- Safari/Firefox parity chasing: feature-detect and be honest; WebGPU coverage improves on its own schedule.

## Architecture

```
Vite + React + TS PWA (Vercel — static hosting only)
  ├─ WebLLM (MLC) engine in a Web Worker (UI never blocks)
  │    ├─ Model tiers (q4 instruct builds, exact builds pinned at implementation):
  │    │    Small ~1–2GB (default · low-RAM) / Mid ~2–3GB (recommended on capable hardware)
  │    │    (selection persisted; switchable in settings)
  │    ├─ Weights cached via Cache Storage/IndexedDB (WebLLM's cache) + persistent-storage request
  │    └─ Generation: streaming, stop button, context-window trim with visible "trimmed" notice
  ├─ Service worker: precache app shell → full offline boot
  ├─ Modes: Chat · Translate (lang pair picker, auto-detect source) · Summarize (length picker)
  │    — one engine, mode = system-prompt template + output post-shape
  └─ IndexedDB: conversations, settings · Export = JSON download · Wipe = one button
```

- **First-run flow is the product:** landing explains the deal (download once, own it forever) → hardware check → model recommendation + size → download with real progress + resume → tiny warm-up generation → ready badge. Every later visit: instant load, no network.
- **The airplane test as a feature:** an "Offline verified" indicator flips when the app detects it's running with no network and still generating — turning the demo's money moment into UI.
- **Unsupported path:** no WebGPU → clear explainer, supported-browser list, and a 30-second screen recording so the portfolio visitor on an old browser still *sees* the product.

## Security, cost & abuse controls

Structurally minimal: no server, no keys, no per-use cost — nothing to rate-limit. The only obligations are honest storage handling (show weights' disk usage, one-tap model deletion) and clear content framing (small models say wrong things confidently; a one-line "small local model — verify important answers" notice sits in the UI).

## Portfolio integration

- Repo `planemode` (public), live at planemode.vercel.app. Card copy: "AI that works in airplane mode. No server exists."
- README centerpiece: a GIF of generation continuing with Wi-Fi visibly toggled off — the whole pitch in three seconds.
- Completes the on-device axis on the AI tab; pairs narratively with AskSheet's "your data stays local" as the privacy wing of the lineup.

## Delivery phases

1. **Phase 1 (single implementation plan):** engine-in-worker + chat with streaming, model download UX with progress/persistence, service-worker offline shell, hardware detection + unsupported fallback, local history + export/wipe, offline-verified indicator.
2. **Phase 2:** Translate + Summarize modes, model picker with second tier, mobile-install polish (iOS quirks), optional "offline notes" experiment.

## Success criteria

- The airplane test, literally: load once on a mid-range laptop, enable airplane mode, reload the installed PWA, hold a chat — everything works. Documented as a recorded test.
- First meaningful token in a fresh chat < 5s after model load on target hardware; sustained generation ≥ 8 tok/s on the default tier.
- Translate mode (phase 2) produces Turkish and Arabic output the author rates acceptable on a 20-sentence spot check — a personal-credibility bar no competing portfolio can copy.
- Storage honesty verified: reported weight size matches actual usage; wipe returns the origin to near-zero storage.

## Decisions taken (override if you disagree)

- Name **PlaneMode**; WebLLM/MLC over transformers.js (materially better WebGPU LLM throughput); exact model builds pinned at implementation time against the then-current WebLLM catalog (spec pins *tiers*, not model names, on purpose).
- Chat ships first; Translate/Summarize are phase 2 (one excellent mode beats three mediocre ones at launch).
- Zero telemetry in-app, permanently — it's the product's thesis.

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`, though less than any other project.
PlaneMode has no backend, so most of the platform layer simply does not apply: **no Postgres
schema, no storage allocation, no quotas, no LLM spend, no rate limits.** It remains the only
project in the lineup with zero marginal cost.

## Changes

- **Hosting:** Cloudflare Pages at `labs.abdash.net/planemode`.
- **No login required, ever.** The shared anonymous session exists on the origin, but PlaneMode
  must never depend on it or prompt for it. An app whose thesis is "no server is involved" cannot
  ask you to sign in.

## Two real gotchas found in verification

**Weights must come from the HuggingFace CDN, never self-hosted.** This was implicit; it is now
load-bearing. Cloudflare Pages caps individual files at **25 MiB**, so bundling multi-gigabyte
weights is impossible regardless of intent — and self-serving them would be worse, since fifty
downloads of a 2 GB model is 100 GB of transfer. WebLLM's default CDN behaviour is correct here;
the implementation must not "improve" it.

**Service worker scope is constrained by path-based hosting.** A service worker registered at
`/planemode/sw.js` can only control `/planemode/*`. This is exactly the desired behaviour — the
offline shell must not capture the other six apps — but it has to be configured deliberately with
the right `scope` rather than assumed. Registering at the origin root would break every sibling
app, so this is the single sharpest edge the single-origin decision introduces, and it lives
here.

A consequence worth stating: the offline test must be run against `/planemode/`, and the PWA
manifest's `start_url` and `scope` must both be path-qualified for install-to-homescreen to
resolve correctly.

## Unchanged

Everything else. The engine-in-a-worker architecture, model tiers pinned at implementation
against the then-current WebLLM catalog, the first-run download UX with progress and resume, the
"offline verified" indicator, IndexedDB history with export and wipe, the unsupported-browser
explainer with a screen recording, and chat-before-translate phasing all stand as written.

The literal airplane test remains the success criterion, and it is still the best demo in the
lineup.
