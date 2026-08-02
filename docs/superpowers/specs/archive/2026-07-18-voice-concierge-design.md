> # ⛔ ARCHIVED — WILL NOT BE IMPLEMENTED
>
> Superseded on 2026-08-01. **Replaced by `2026-08-01-concierge-design.md`.**
> Retained for provenance only: the reasoning is often still sound, but the stack,
> hosting, and delivery assumptions in this document are wrong. Do not implement from it.
> See `archive/README.md` for what changed and why.

---

# Voice Portfolio Concierge — Design

**Date:** 2026-07-18
**One-liner:** An embedded voice agent on the AI tab — "interview my AI" — that has ingested Abdulrahman's CV, site content, and project case studies, and answers questions about his experience out loud, in realtime.

## Why it's notable

Nobody forgets talking to a portfolio. Recruiters and peers landing on the AI tab can hold a spoken conversation with an agent that knows the CV cold — it *is* the live demo the tab has promised for months, and it demonstrates professionally relevant skill (the author builds voice screening agents at work; this is the same discipline pointed at himself, employer IP untouched).

## Goals

1. A click-to-start voice conversation embedded directly in the AI tab (no navigation away, no install).
2. Grounded answers about experience, projects, skills, and availability — including the other AI-tab projects ("ask it about ReadLLM").
3. Strict persona guardrails: it represents Abdulrahman professionally and deflects everything else.
4. Hard usage caps so strangers cannot burn the voice-minutes budget.
5. A text-chat fallback for muted/quiet environments and unsupported browsers.

## Non-goals

- Phone/SIP access (web only).
- Self-hosted voice pipeline in v1 (see phase 2 option).
- The agent taking actions (booking calls, sending emails). It talks; it can *point* to the contact section.

## Architecture

**Platform decision: ElevenLabs Agents (hosted conversational AI).** The author's account already exists; the platform handles STT → LLM → TTS orchestration, turn-taking, barge-in, and per-agent usage limits, and it exposes a web SDK/widget that embeds cleanly in a static Astro site — critical, since abdash.github.io has no server. A self-hosted LiveKit pipeline (the author's day-job stack) is deliberately deferred: it demonstrates more engineering but requires a running Python worker and infra babysitting for a portfolio widget that must simply always work.

```
Astro site (GitHub Pages, static)
  └─ AI tab → Concierge island (React) — click-to-start
        └─ ElevenLabs Agents web SDK (WebRTC/WebSocket, agent ID is public by design)
              ├─ Agent config: persona prompt + guardrails + voice
              ├─ Knowledge base: generated dossier (see below)
              └─ Platform-side usage limits + concurrency caps
```

**Knowledge base generation is a script, not a paste.** `scripts/build-dossier.ts` in the site repo compiles: CV source of truth + About/Experience/Projects content extracted from the site components + one paragraph per AI-tab project (from these specs). Output is a single markdown dossier uploaded to the agent's knowledge base. Regenerating after a site update is one command; the dossier is versioned in the repo so drift is visible in diffs.

## Agent design

- **Persona:** speaks *as Abdulrahman's assistant, about Abdulrahman* — third person, so it never fakes being him. Warm, concise, concrete; answers in ≤3 sentences unless asked to elaborate; always grounded in the dossier.
- **Guardrails (system prompt + platform settings):** on-topic scope is the professional profile and the portfolio projects. Off-topic requests (general assistant work, opinions, code help, anything about other people) get a one-line friendly deflection back to scope. No salary negotiation — it states "that's for a human conversation" and points to contact. It never invents employers, dates, or skills not in the dossier; when unsure it says so and suggests emailing.
- **Voice:** one fixed, professional ElevenLabs voice (not a clone of the author — avoids uncanny/consent weirdness and keeps the assistant framing honest).
- **Languages:** English primary at launch; the platform's multilingual capability + the author's Turkish/Arabic make a natural later upgrade, noted but out of scope for v1.

## Site integration (the embedded piece)

- The Coming Soon demo card is replaced by the concierge card: idle state shows a mic icon + "Interview my AI" + suggested questions ("What's his experience with RAG?", "Is he available?"); active state shows listening/speaking indicators, a live transcript line, an end-call button, and a text-input toggle.
- Nothing loads until click (the SDK is lazy-imported) — the tab stays lightweight and no mic permission is requested pre-consent.
- Session UX: sessions cap at 5 minutes with a visible timer near the end; on cap or agent-limit exhaustion the card degrades gracefully to text chat or a "the agent is resting — email me instead" state, never a broken widget.

## Security, cost & abuse controls

- The agent ID is public (unavoidable for client-side embed); protection is platform-side: per-agent concurrency limit (1–2 sessions), daily minutes budget, and the 5-minute session cap. When the daily budget is gone, the widget shows the resting state — fail soft, never fail broken.
- Domain allowlisting for the widget (ElevenLabs supports origin restrictions) so the agent can't be embedded elsewhere to drain the budget.
- No user data is stored by us; conversations live only in the ElevenLabs dashboard (retention default). A one-line privacy note sits under the widget ("voice processed by ElevenLabs — don't share secrets with it").

## Delivery phases

1. **Phase 1 (single implementation plan):** dossier build script → agent configured (persona, guardrails, limits) → React island with idle/active/resting states → replace Coming Soon card → cross-browser + mobile verification.
2. **Phase 2 (optional, later):** self-hosted LiveKit variant behind the same UI as a written case study ("hosted vs self-hosted voice agents") — engineering-depth content without risking the always-on widget.

## Success criteria

- A first-time visitor starts a conversation in ≤2 clicks and gets a correct, dossier-grounded spoken answer about experience within seconds.
- Ten adversarial off-topic prompts (roleplay requests, other people, general tasks) all get in-character deflections; zero fabricated facts about the author in a 20-question audit.
- Widget failure modes verified: mic denied, unsupported browser, budget exhausted — all land in usable fallback states.
- A full month of normal traffic stays inside the voice-minutes budget without manual intervention.

## Decisions taken (override if you disagree)

- ElevenLabs Agents over self-hosted LiveKit for v1 (reliability > engineering flex; phase 2 covers the flex).
- Assistant-persona in third person, stock voice, no voice clone.
- 5-minute sessions, English-only at launch, text fallback included from day one.

---

# Revision — 2026-08-01

**Depends on:** `2026-08-01-labs-platform-design.md`. **The ElevenLabs Agents architecture above
is withdrawn.**

## What broke

The account was checked, not assumed: **free tier, 10,000 characters per month,
`can_extend_character_limit: false`**, and ElevenLabs states all products draw from one shared
credit pool. Ten thousand characters is roughly ten to twelve minutes of synthesized speech per
month in total — and Recto's phase-2 audio overviews compete for the same pool.

An always-on public widget with 5-minute sessions gets **two conversations a month** before the
budget is exhausted. The spec's own graceful-degradation state ("the agent is resting") would be
the state essentially every visitor encountered. The design was sound; the account it assumed
does not exist.

## Replacement architecture — build the loop

```
Astro site (abdash.net) → Concierge island (React), lazy-imported on click
  ├─ Input:  Web Speech API SpeechRecognition  (free, unlimited)
  ├─ Brain:  fetch → labs.abdash.net/api/concierge/turn  (OpenRouter, MODEL_CHEAP)
  ├─ Output: SpeechSynthesis  (free, on-device, unlimited)
  └─ Turn-taking, barge-in, silence detection, and interrupt handling written here
```

The dossier build script, the persona and guardrail design, the session UX, and the text fallback
all survive unchanged from the original spec. Only the voice transport is replaced.

**This is a better portfolio artifact than the thing it replaces.** Configuring a hosted agent
demonstrates that you can read a vendor's documentation. Implementing turn-taking, barge-in, and
interrupt handling against a raw browser speech API demonstrates that you understand what a voice
agent actually is. The constraint improved the project.

## Accepted costs

- Voice quality is below ElevenLabs. `SpeechSynthesis` voices vary by platform and are noticeably
  synthetic on some. Honest trade, stated in the UI.
- `SpeechRecognition` is effectively Chromium-only and routes audio through Google's servers. The
  privacy note must say so. Safari and Firefox fall through to the text concierge — a path the
  original spec already required for muted environments, so no new work.
- No server-side conversation storage, unchanged.

The 10,000 ElevenLabs characters are **reserved for Recto's audio overviews**, where synthesis
quality is the actual product rather than a transport detail.

## Placement

The island stays in the portfolio site repo, since it is embedded in the Astro AI tab. Its proxy
lives in the labs monorepo at `/api/concierge/turn`, with `abdash.net` on the CORS allowlist and
per-IP rate limiting through `platform.rate_limits` — the concierge is the one unauthenticated
surface in the program, so it gets IP-based limits rather than user quotas.

## Revised success criteria

Replacing the voice-minutes criterion: a full month of normal traffic costs only OpenRouter
tokens, with no voice budget to exhaust and therefore no resting state. Barge-in is verified
manually — interrupting mid-sentence must stop synthesis within roughly 200 ms and start
listening again.
