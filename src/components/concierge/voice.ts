/**
 * The voice loop.
 *
 * This is the part of the concierge worth building carefully, because it is the
 * part being claimed: turn-taking, barge-in, silence detection and interrupt
 * handling implemented against the raw browser speech API rather than rented
 * from a hosted voice platform.
 *
 * It is written as an explicit state machine — idle → listening → thinking →
 * speaking → listening — rather than as nested callbacks, because two of the
 * failure modes below are only tractable when there is one place that owns
 * "what is happening right now".
 *
 * The two bugs that make a hand-built loop feel broken:
 *
 *   1. `onend` is not end-of-turn. Chromium ends the recognition session on its
 *      own schedule — after a pause, after an internal timeout, sometimes for no
 *      visible reason. A loop that treats `onend` as "the user stopped talking"
 *      cuts people off mid-sentence. Here `onend` only ever means "restart
 *      recognition"; end-of-turn is decided by interim results plus a silence
 *      timer, and by nothing else.
 *
 *   2. Self-echo. Recognition stays active while the answer is being spoken, so
 *      that the visitor can interrupt. That means the microphone hears the
 *      synthesiser, and without a guard the loop interrupts itself, transcribes
 *      its own answer, and asks itself a question. See `isLikelyEcho`.
 */

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** One recognition result, flattened out of the browser's nested event shape. */
export interface RecognitionEvent {
  transcript: string
  /** Chromium reports 0 on interim results — treat 0 as "unknown", not "bad". */
  confidence: number
  isFinal: boolean
}

export interface RecognitionBackend {
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

export interface SynthesisBackend {
  speak(text: string, onDone: () => void): void
  cancel(): void
}

export interface VoiceLoopOptions {
  /** Streams an answer token by token. Supplied by the caller so the loop has
   *  no opinion about transport, and so tests need no network. */
  ask: (question: string) => AsyncIterable<string>
  /** How long a pause ends the visitor's turn. */
  silenceMs?: number
  /** Results below this confidence, arriving while the loop is answering, are
   *  treated as the loop hearing itself. */
  echoConfidenceFloor?: number
  createRecognition?: () => RecognitionBackend
  createSynthesis?: () => SynthesisBackend
  onError?: (e: unknown) => void
  /** Called with each answer token as it streams, for the on-screen transcript. */
  onAnswerToken?: (token: string) => void
}

export interface VoiceLoop {
  readonly state: VoiceState
  start(): void
  stop(): void
  onState(cb: (s: VoiceState) => void): () => void
  onTranscript(cb: (text: string, final: boolean) => void): () => void
  /** Ask a typed question through the same turn machinery as a spoken one. */
  sendText(text: string): void
}

/* ── tuning ─────────────────────────────────────────────────────────────── */

const DEFAULT_SILENCE_MS = 900
const DEFAULT_ECHO_FLOOR = 0.5

/** Below this, a "sentence" is probably an abbreviation like "Dr." — keep buffering. */
const MIN_CHUNK_CHARS = 16
/** Above this, flush at a word boundary anyway so speech is never held hostage
 *  to a model that forgot to punctuate. */
const MAX_CHUNK_CHARS = 180

const SENTENCE_ENDINGS = '.!?…'

/* ── text helpers ───────────────────────────────────────────────────────── */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pulls one speakable chunk off the front of a streaming buffer, or null if the
 * buffer does not yet contain one. Chunking on sentence boundaries is what lets
 * the answer start playing before the model has finished generating it.
 */
export function takeChunk(buffer: string): { text: string; rest: string } | null {
  for (let i = MIN_CHUNK_CHARS; i < buffer.length; i++) {
    const ch = buffer[i]

    if (ch === '\n') {
      return { text: buffer.slice(0, i).trim(), rest: buffer.slice(i + 1) }
    }

    if (SENTENCE_ENDINGS.includes(ch)) {
      const next = buffer[i + 1]
      // A terminator only ends a sentence if whitespace (or nothing) follows it.
      // This is what keeps "abdash.net" and "3.5" in one piece.
      if (next === undefined || /\s/.test(next)) {
        return { text: buffer.slice(0, i + 1).trim(), rest: buffer.slice(i + 1) }
      }
    }
  }

  if (buffer.length >= MAX_CHUNK_CHARS) {
    const space = buffer.lastIndexOf(' ', MAX_CHUNK_CHARS)
    const at = space > MIN_CHUNK_CHARS ? space : MAX_CHUNK_CHARS
    return { text: buffer.slice(0, at).trim(), rest: buffer.slice(at) }
  }

  return null
}

/* ── the loop ───────────────────────────────────────────────────────────── */

export function createVoiceLoop(opts: VoiceLoopOptions): VoiceLoop {
  const silenceMs = opts.silenceMs ?? DEFAULT_SILENCE_MS
  const echoFloor = opts.echoConfidenceFloor ?? DEFAULT_ECHO_FLOOR
  const makeRecognition = opts.createRecognition ?? createBrowserRecognition
  const makeSynthesis = opts.createSynthesis ?? createBrowserSynthesis

  let state: VoiceState = 'idle'
  /** True between start() and stop(). Every async continuation checks it. */
  let active = false

  let recognition: RecognitionBackend | null = null
  let synthesis: SynthesisBackend | null = null

  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  // Current visitor turn.
  let finalParts: string[] = []
  let interim = ''
  /** Normalised finals already accepted this turn — Chromium re-delivers them. */
  let seenFinals = new Set<string>()

  /**
   * Monotonic turn counter. Every async continuation captures the turn it was
   * started for and bails if the counter has moved on. This is what makes
   * barge-in safe: interrupting bumps the counter, and the abandoned answer's
   * in-flight stream and queued utterances become no-ops instead of racing the
   * new turn.
   */
  let turnId = 0

  // Current answer.
  let speechQueue: string[] = []
  let utteranceInFlight = false
  let streamComplete = false
  /** Everything handed to the synthesiser this turn, for the echo check. */
  let spokenThisTurn = ''

  const stateCbs = new Set<(s: VoiceState) => void>()
  const transcriptCbs = new Set<(text: string, final: boolean) => void>()

  /* ── plumbing ─────────────────────────────────────────────────────────── */

  function setState(next: VoiceState): void {
    if (state === next) return
    state = next
    for (const cb of stateCbs) cb(next)
  }

  function currentTranscript(): string {
    return [...finalParts, interim].filter(Boolean).join(' ').trim()
  }

  function emitTranscript(final: boolean): void {
    const text = currentTranscript()
    for (const cb of transcriptCbs) cb(text, final)
  }

  function clearTurnBuffer(): void {
    finalParts = []
    interim = ''
    seenFinals = new Set()
  }

  function clearSilenceTimer(): void {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer)
      silenceTimer = null
    }
  }

  function armSilenceTimer(): void {
    clearSilenceTimer()
    silenceTimer = setTimeout(endVisitorTurn, silenceMs)
  }

  function getSynthesis(): SynthesisBackend {
    synthesis ??= makeSynthesis()
    return synthesis
  }

  /* ── recognition ──────────────────────────────────────────────────────── */

  function startRecognition(): void {
    if (!active) return
    if (!recognition) {
      recognition = makeRecognition()
      recognition.onresult = handleResult
      recognition.onend = handleEnd
      recognition.onerror = handleError
    }
    try {
      recognition.start()
    } catch {
      // Already running. The API throws rather than no-opping, and there is
      // nothing to do about it — we wanted it running and it is.
    }
  }

  function handleEnd(): void {
    if (!active) return
    // NOT end-of-turn. Chromium ends the session on its own schedule; the only
    // correct response is to open a new one and keep listening. End-of-turn is
    // the silence timer's job, and the turn buffer deliberately survives this
    // restart so a sentence split across two sessions stays one question.
    startRecognition()
  }

  function handleError(e: { error: string }): void {
    if (!active) return
    // 'no-speech' and 'aborted' are routine; onend follows and restarts us.
    if (e.error === 'no-speech' || e.error === 'aborted') return
    opts.onError?.(new Error(`speech recognition: ${e.error}`))
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stop()
  }

  /**
   * Is this result the loop hearing its own synthesised speech?
   *
   * The primary guard is the confidence floor: the microphone picking up a
   * speaker at a distance scores badly, and a visitor speaking into it does not.
   *
   * The floor alone is not enough, because Chromium reports confidence 0 on
   * interim results — the very results barge-in depends on. Rejecting everything
   * at 0 would make interruption impossible; accepting everything at 0 would let
   * every echo through. So when confidence is unknown we fall back to content:
   * our own words coming back are, by definition, words we just said.
   */
  function isLikelyEcho(text: string, confidence: number): boolean {
    if (confidence > 0 && confidence < echoFloor) return true
    if (confidence === 0) {
      const heard = normalise(text)
      if (heard.split(' ').length < 2) return true // too short to act on
      return normalise(spokenThisTurn).includes(heard)
    }
    return false
  }

  function handleResult(e: RecognitionEvent): void {
    if (!active) return
    const text = e.transcript.trim()
    if (!text) return

    if (state === 'thinking' || state === 'speaking') {
      if (isLikelyEcho(text, e.confidence)) return
      bargeIn(text, e.isFinal)
      return
    }

    if (state !== 'listening') return

    if (e.isFinal) {
      const key = normalise(text)
      if (!key || seenFinals.has(key)) {
        // Duplicate delivery of one utterance — common around session restarts.
        // Still counts as activity, so keep the silence timer alive.
        armSilenceTimer()
        return
      }
      seenFinals.add(key)
      finalParts.push(text)
      interim = ''
      emitTranscript(true)
    } else {
      interim = text
      emitTranscript(false)
    }

    armSilenceTimer()
  }

  /* ── turns ────────────────────────────────────────────────────────────── */

  function endVisitorTurn(): void {
    silenceTimer = null
    if (!active || state !== 'listening') return
    const question = currentTranscript()
    if (!question) return // silence with nothing said — keep listening
    startAnswer(question)
  }

  function startAnswer(question: string): void {
    clearSilenceTimer()
    clearTurnBuffer()

    turnId += 1
    const myTurn = turnId

    speechQueue = []
    utteranceInFlight = false
    streamComplete = false
    spokenThisTurn = ''

    setState('thinking')
    void runAnswer(myTurn, question)
  }

  async function runAnswer(myTurn: number, question: string): Promise<void> {
    let buffer = ''
    try {
      for await (const token of opts.ask(question)) {
        if (!active || myTurn !== turnId) return
        buffer += token
        opts.onAnswerToken?.(token)

        let chunk = takeChunk(buffer)
        while (chunk !== null) {
          buffer = chunk.rest
          enqueueSpeech(myTurn, chunk.text)
          chunk = takeChunk(buffer)
        }
      }

      if (!active || myTurn !== turnId) return
      if (buffer.trim()) enqueueSpeech(myTurn, buffer.trim())
      streamComplete = true
      pump(myTurn)
    } catch (e) {
      if (!active || myTurn !== turnId) return
      opts.onError?.(e)
      backToListening()
    }
  }

  function enqueueSpeech(myTurn: number, text: string): void {
    if (!text || myTurn !== turnId) return
    speechQueue.push(text)
    spokenThisTurn += ` ${text}`
    if (state === 'thinking') setState('speaking')
    pump(myTurn)
  }

  function pump(myTurn: number): void {
    if (myTurn !== turnId || !active) return
    if (utteranceInFlight) return

    const next = speechQueue.shift()
    if (next === undefined) {
      if (streamComplete) backToListening()
      return
    }

    utteranceInFlight = true
    getSynthesis().speak(next, () => {
      utteranceInFlight = false
      if (myTurn !== turnId || !active) return
      pump(myTurn)
    })
  }

  function backToListening(): void {
    speechQueue = []
    utteranceInFlight = false
    streamComplete = false
    spokenThisTurn = ''
    clearTurnBuffer()
    clearSilenceTimer()
    setState('listening')
  }

  /**
   * The visitor talked over the answer. Stop speaking immediately — this is the
   * ~200ms budget, and it is met by doing the cancel synchronously on the first
   * qualifying result rather than waiting for a final — and treat the words that
   * interrupted us as the opening of the new turn, because they usually are.
   */
  function bargeIn(text: string, isFinal: boolean): void {
    turnId += 1 // orphans the in-flight stream and everything it queued

    getSynthesis().cancel()
    speechQueue = []
    utteranceInFlight = false
    streamComplete = false
    spokenThisTurn = ''

    clearTurnBuffer()
    setState('listening')

    if (isFinal) {
      seenFinals.add(normalise(text))
      finalParts.push(text)
    } else {
      interim = text
    }
    emitTranscript(isFinal)
    armSilenceTimer()
  }

  /* ── public surface ───────────────────────────────────────────────────── */

  function start(): void {
    if (active) return
    active = true
    clearTurnBuffer()
    setState('listening')
    startRecognition()
  }

  function stop(): void {
    if (!active && state === 'idle') return
    active = false
    turnId += 1 // orphan anything in flight

    clearSilenceTimer()
    recognition?.abort()
    recognition = null
    synthesis?.cancel()

    speechQueue = []
    utteranceInFlight = false
    streamComplete = false
    spokenThisTurn = ''
    clearTurnBuffer()
    setState('idle')
  }

  function sendText(text: string): void {
    const question = text.trim()
    if (!question || !active) return
    if (state === 'thinking' || state === 'speaking') {
      // Typing over a spoken answer is an interruption like any other.
      getSynthesis().cancel()
    }
    startAnswer(question)
  }

  return {
    get state() {
      return state
    },
    start,
    stop,
    onState(cb) {
      stateCbs.add(cb)
      return () => stateCbs.delete(cb)
    },
    onTranscript(cb) {
      transcriptCbs.add(cb)
      return () => transcriptCbs.delete(cb)
    },
    sendText,
  }
}

/* ── browser backends ───────────────────────────────────────────────────── */

interface SpeechRecognitionCtor {
  new (): {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((e: unknown) => void) | null
    onend: (() => void) | null
    onerror: ((e: unknown) => void) | null
  }
}

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null
}

/** Both halves are required. Safari and Firefox have synthesis but not
 *  recognition, which is exactly why the text fallback exists. */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return recognitionCtor() !== null && w.speechSynthesis !== undefined
}

export function createBrowserRecognition(lang = 'en-US'): RecognitionBackend {
  const Ctor = recognitionCtor()
  if (!Ctor) throw new Error('SpeechRecognition is not available in this browser')

  const native = new Ctor()
  native.lang = lang
  native.continuous = true
  native.interimResults = true
  native.maxAlternatives = 1

  const backend: RecognitionBackend = {
    start: () => native.start(),
    stop: () => native.stop(),
    abort: () => native.abort(),
    onresult: null,
    onend: null,
    onerror: null,
  }

  native.onresult = (event: unknown) => {
    const e = event as {
      resultIndex: number
      results: ArrayLike<
        ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
      >
    }
    // Only the results added since the last event; earlier ones were already
    // delivered, and re-reading them is a source of duplicate finals.
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      const alt = result?.[0]
      if (!alt) continue
      backend.onresult?.({
        transcript: alt.transcript,
        confidence: alt.confidence ?? 0,
        isFinal: result.isFinal === true,
      })
    }
  }
  native.onend = () => backend.onend?.()
  native.onerror = (e: unknown) =>
    backend.onerror?.({ error: String((e as { error?: unknown })?.error ?? 'unknown') })

  return backend
}

export function createBrowserSynthesis(lang = 'en-US'): SynthesisBackend {
  const synth = (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis

  return {
    speak(text, onDone) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      utterance.rate = 1.05
      let done = false
      const finish = () => {
        if (done) return
        done = true
        onDone()
      }
      utterance.onend = finish
      // A cancelled utterance fires onerror, not onend. Without this the queue
      // would stall forever on the first interruption.
      utterance.onerror = finish
      synth.speak(utterance)
    },
    cancel() {
      synth.cancel()
    },
  }
}
