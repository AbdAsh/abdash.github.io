# PlaneMode — Offline WebGPU AI Workspace — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-planemode-design.md`
**Depends on:** `2026-08-01-platform-design.md` — less than any other project, deliberately
**One-liner:** A PWA that runs a small LLM entirely in the browser via WebGPU — chat, translate,
and summarize with zero server, zero API, zero network. Install it, switch on airplane mode, it
still works.

## Why it's notable

"There is no server" is a story every audience gets instantly. Engineers respect the
WebGPU/WebLLM plumbing; everyone else respects "my words never leave this device" and "it works
on a plane." It is the only project in the lineup with literally zero marginal cost and zero
abuse surface, and it completes the portfolio's range: cloud RAG in Recto, proxied inference with
local execution in AskSheet, fully on-device here.

## How it relates to the platform

Barely, and that is the point. PlaneMode owns **no Postgres schema, no storage allocation, no
Edge Function, no quota, no LLM spend, and no rate limit.** It is a static bundle on Cloudflare
Pages and nothing else.

**No login, ever.** The shared anonymous session exists on the origin, but PlaneMode must never
depend on it, read it, or prompt for it. An app whose entire thesis is "no server is involved"
cannot ask you to sign in.

## Goals

1. Chat with a small instruct model running fully client-side via WebLLM/MLC, streaming tokens at
   usable speed on ordinary hardware.
2. Two task modes beyond chat, chosen because they are what people actually need offline:
   **Translate** (including English↔Turkish↔Arabic, which the author can verify personally) and
   **Summarize**. Both are prompt templates over the same engine, not separate systems.
3. True offline PWA: after first load and model download, the app shell *and* the weights serve
   from local storage with the network off.
4. Honest hardware UX: detect WebGPU and approximate memory, recommend a model tier, show the
   download size *before* downloading, and degrade gracefully on unsupported browsers.
5. Conversations persist locally in IndexedDB, with export and wipe controls — private by
   architecture, and legible as such.

## Non-goals

- Matching cloud-model quality. The UI is honest that this is a small model; the point is where it
  runs, not benchmark supremacy.
- RAG or document upload — Recto's job. A phase-2 "offline notes search" idea is parked
  deliberately.
- Server-side anything: no accounts, no telemetry from the app, no analytics beyond a
  privacy-respecting counter on the *landing* section only.
- Safari and Firefox parity chasing. Feature-detect and be honest; WebGPU coverage improves on its
  own schedule.

## Architecture

```
Vite + React + TS PWA → Cloudflare Pages at labs.abdash.net/planemode
  ├─ WebLLM (MLC) engine in a Web Worker (the UI never blocks)
  │    ├─ Model tiers (q4 instruct builds, exact builds pinned at implementation):
  │    │    Small ~1–2 GB (default, low-RAM) / Mid ~2–3 GB (recommended on capable hardware)
  │    ├─ Weights cached by WebLLM in Cache Storage/IndexedDB + persistent-storage request
  │    └─ Generation: streaming, stop button, context-window trim with a visible notice
  ├─ Service worker (scope: /planemode/) — precaches the app shell for full offline boot
  ├─ Modes: Chat · Translate (language pair, auto-detect source) · Summarize (length picker)
  │    — one engine; a mode is a system-prompt template plus output shaping
  └─ IndexedDB: conversations, settings · Export = JSON download · Wipe = one button
```

## Two gotchas found in verification

**Weights must load from the HuggingFace CDN, never self-hosted.** This was implicit in the July
spec; it is now load-bearing. Cloudflare Pages caps individual files at **25 MiB**, so bundling
multi-gigabyte weights is impossible regardless of intent — and self-serving them would be worse,
since fifty downloads of a 2 GB model is 100 GB of transfer. WebLLM's default CDN behaviour is
correct here, and the implementation must not "improve" it.

**Service worker scope is constrained by path-based hosting.** A worker registered at
`/planemode/sw.js` can only control `/planemode/*`. That is exactly the desired behaviour — the
offline shell must not capture the other six apps — but it has to be configured deliberately with
an explicit `scope` rather than assumed. Registering at the origin root would break every sibling
app, which makes this the single sharpest edge the one-origin decision introduces, and it lives
here.

Consequences: the offline test must be run against `/planemode/`, and the PWA manifest's
`start_url` and `scope` must both be path-qualified for install-to-homescreen to resolve
correctly.

## Core flows

**First run is the product.** Landing explains the deal — download once, own it forever →
hardware check → model recommendation with size → download with real progress and resume → a tiny
warm-up generation → ready badge. Every later visit loads instantly with no network.

**The airplane test as a feature.** An "Offline verified" indicator flips when the app detects it
is running with no network and still generating — turning the demo's money moment into UI.

**Unsupported path.** No WebGPU means a clear explainer, a supported-browser list, and a
30-second screen recording, so a portfolio visitor on an old browser still *sees* the product.

## Security, cost & abuse controls

Structurally minimal: no server, no keys, no per-use cost, nothing to rate-limit. The only
obligations are honest storage handling — show the weights' disk usage, offer one-tap model
deletion — and clear content framing, since small models say wrong things confidently. A one-line
"small local model, verify important answers" notice sits in the UI.

## Delivery phases

1. **Phase 1** — engine in a worker with streaming chat, model download UX with progress and
   persistence, service-worker offline shell at the correct scope, hardware detection and the
   unsupported fallback, local history with export and wipe, the offline-verified indicator.
2. **Phase 2** — Translate and Summarize modes, model picker with the second tier, mobile install
   polish including iOS quirks, and the optional offline-notes experiment.

## Success criteria

- **The airplane test, literally:** load once on a mid-range laptop, enable airplane mode, reload
  the installed PWA, hold a chat. Everything works. Documented as a recorded test.
- First meaningful token in a fresh chat under 5 s after model load; sustained generation at 8
  tokens/second or better on the default tier.
- Translate mode (phase 2) produces Turkish and Arabic the author rates acceptable across a
  20-sentence spot check — a personal-credibility bar no competing portfolio can copy.
- Storage honesty verified: reported weight size matches actual usage, and wipe returns the origin
  to near-zero storage.
- The service worker is confirmed not to intercept any request outside `/planemode/`.

## Decisions taken

- Name **PlaneMode**; WebLLM/MLC over transformers.js for materially better WebGPU throughput;
  exact model builds pinned at implementation time against the then-current catalog — this spec
  pins *tiers*, not model names, on purpose.
- Chat ships first; Translate and Summarize are phase 2. One excellent mode beats three mediocre
  ones at launch.
- Weights from the HuggingFace CDN, never self-hosted.
- Service worker explicitly scoped to `/planemode/`.
- Zero telemetry in-app, permanently. It is the product's thesis.
