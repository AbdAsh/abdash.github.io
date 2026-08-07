# Concierge — Voice Portfolio Agent — Design

**Date:** 2026-08-01
**Supersedes:** `archive/2026-07-18-voice-concierge-design.md`
**Depends on:** `2026-08-01-platform-design.md`
**One-liner:** An embedded voice agent on the AI tab — "interview my AI" — that has ingested the
CV, site content, and project case studies, and answers questions about the author's experience
out loud, in realtime, over a voice loop built rather than rented.

## Why the original design was withdrawn

The July spec was built on ElevenLabs Agents. The account was then checked rather than assumed:
**free tier, 10,000 characters per month, `can_extend_character_limit: false`**, with all
ElevenLabs products drawing from one shared credit pool.

Ten thousand characters is roughly ten to twelve minutes of synthesized speech per month in
total, and Recto's audio overviews compete for the same pool. An always-on public widget with
five-minute sessions gets **two conversations a month** before exhausting the budget — meaning
the spec's own graceful-degradation state ("the agent is resting") would be what essentially
every visitor saw. The design was sound; the account it assumed does not exist.

## Why the replacement is better

Configuring a hosted agent demonstrates that you can read a vendor's documentation. Implementing
turn-taking, barge-in, silence detection, and interrupt handling against a raw browser speech API
demonstrates that you understand what a voice agent actually *is* — which is the claim worth
making, given the author builds voice screening agents professionally.

The constraint improved the project. It costs nothing and has no budget to exhaust, so the
resting state disappears entirely.

## Goals

1. Click-to-start voice conversation embedded in the AI tab — no navigation, no install.
2. Grounded answers about experience, projects, skills, and availability, including the other six
   AI-tab projects ("ask it about Recto").
3. Strict persona guardrails: it represents the author professionally and deflects everything
   else.
4. A text-chat fallback for muted environments and unsupported browsers.

## Non-goals

- Phone/SIP access. Web only.
- The agent taking actions — booking calls, sending emails. It talks; it can *point* to contact.
- Voice cloning. A stock synthesis voice keeps the assistant framing honest.

## Architecture

```
Astro site (abdash.net) → Concierge island (React), lazy-imported on click
  ├─ Input:   Web Speech API SpeechRecognition        (free, unlimited)
  ├─ Brain:   fetch → Supabase Edge Function concierge-turn
  │              └─ OpenRouter, MODEL_CHEAP, dossier in context
  ├─ Output:  SpeechSynthesis                          (free, on-device)
  └─ Turn-taking, barge-in, silence detection, interrupt handling — implemented here
```

The island lives in the portfolio site repo, since it is embedded in the Astro AI tab. Its
backend is a Supabase Edge Function like everything else in the program, called cross-origin with
`abdash.net` on the CORS allowlist.

**Knowledge base generation is a script, not a paste.** `scripts/build-dossier.ts` compiles the CV
source of truth, About/Experience/Projects content extracted from site components, and one
paragraph per AI-tab project into a single markdown dossier. The dossier is versioned in the repo
so drift shows up in diffs, and regenerating after a site update is one command.

At dossier scale the whole document fits in context — no retrieval layer, no embeddings, no
vector store. Recto is the project that demonstrates RAG; the concierge would be worse for
imitating it.

## Agent design

- **Persona:** speaks *as the author's assistant, about the author* — third person, so it never
  fakes being him. Warm, concise, concrete; answers in three sentences or fewer unless asked to
  elaborate; always grounded in the dossier.
- **Guardrails:** scope is the professional profile and the portfolio projects. Off-topic requests
  get a one-line friendly deflection back to scope. No salary negotiation — "that's for a human
  conversation," then points to contact. It never invents employers, dates, or skills; when
  unsure it says so and suggests emailing.
- **Languages:** English at launch. Both browser speech APIs support other languages, so
  Turkish and Arabic are a later configuration change rather than a rebuild.

## The voice loop — the actual engineering

This is the part worth building carefully, since it is the part being claimed:

- **Turn detection** via `SpeechRecognition` interim results plus a silence timer; end-of-turn
  fires on sustained silence rather than on the API's own `onend`, which is unreliable across
  browsers.
- **Barge-in**: while synthesis is speaking, recognition stays active. Detected speech cancels
  `speechSynthesis` immediately and opens a new user turn. Target: synthesis stops within roughly
  200 ms of the interruption.
- **Recognition restart loop**: `SpeechRecognition` stops on its own schedule and must be
  restarted without dropping audio or double-firing results. This is the fiddliest part and needs
  explicit state-machine handling rather than nested callbacks.
- **Streaming brain**: the Edge Function streams tokens; synthesis is chunked on sentence
  boundaries so speaking starts before the full answer arrives.

## Site integration

The Coming Soon demo card becomes the concierge card. Idle state shows a mic icon, "Interview my
AI," and suggested questions. Active state shows listening and speaking indicators, a live
transcript line, an end-call button, and a text-input toggle.

Nothing loads until click — the island is lazy-imported and no microphone permission is requested
before consent. Sessions cap at five minutes with a visible timer near the end.

## Accepted costs

- **Voice quality is below ElevenLabs.** `SpeechSynthesis` voices vary by platform and are
  noticeably synthetic on some. An honest trade, stated in the UI.
- **`SpeechRecognition` is effectively Chromium-only** and routes audio through Google's servers.
  The privacy note must say so plainly. Safari and Firefox fall through to the text concierge — a
  path the original spec already required for muted environments, so no new work.
- No server-side conversation storage. Nothing about a visitor is persisted.

The 10,000 ElevenLabs characters are **reserved for Recto's audio overviews**, where synthesis
quality is the product rather than a transport detail.

## Security, cost & abuse controls

The concierge is the one unauthenticated surface in the program — a visitor to abdash.net has no
Supabase session, since that lives on the `labs.abdash.net` origin. It therefore uses **per-IP
limits through `platform.rate_limits`** rather than user quotas: a cap on turns per IP per hour,
a hard per-request token ceiling, and `MODEL_CHEAP`.

Origin check against `abdash.net` so the endpoint cannot be driven from elsewhere. No user data
stored. A one-line privacy note sits under the widget covering the Chromium speech caveat.

## Delivery phases

1. **Phase 1** — dossier build script, `concierge-turn` function with persona and guardrails, the
   voice loop with barge-in, idle/active/text states, replace the Coming Soon card, cross-browser
   and mobile verification.
2. **Phase 2** — Turkish and Arabic voices, and a written case study comparing the hand-built loop
   against a hosted platform, which is engineering-depth content the hosted version could never
   have produced.

## Success criteria

- A first-time visitor starts a conversation in two clicks or fewer and gets a correct,
  dossier-grounded spoken answer within seconds.
- **Barge-in verified manually**: interrupting mid-sentence stops synthesis within roughly 200 ms
  and begins listening again.
- Ten adversarial off-topic prompts all get in-character deflections; zero fabricated facts about
  the author across a twenty-question audit.
- Failure modes land in usable states: microphone denied, unsupported browser, rate limited.
- A month of normal traffic costs only OpenRouter tokens — there is no voice budget to exhaust.

## Decisions taken

- Web Speech API loop over any hosted voice platform, forced by the ElevenLabs ceiling and better
  for the portfolio regardless.
- Whole dossier in context; no retrieval layer.
- Assistant persona in third person, stock voice, no clone.
- Five-minute sessions, English at launch, text fallback from day one.
