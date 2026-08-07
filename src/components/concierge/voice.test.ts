import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createVoiceLoop,
  isSpeechSupported,
  type RecognitionBackend,
  type RecognitionEvent,
  type SynthesisBackend,
  type VoiceState,
} from './voice'

/* ════════════════════════════════════════════════════════════════════════
   Fake backends.

   The whole point of this file is that the two bugs which make a hand-built
   voice loop feel broken — Chromium's spurious `onend`, and the loop hearing
   its own synthesised speech — are invisible without a fake recognition
   backend you can drive frame by frame. A real microphone cannot be made to
   misbehave on demand.
   ═══════════════════════════════════════════════════════════════════════ */

class FakeRecognition implements RecognitionBackend {
  startCalls = 0
  stopCalls = 0
  abortCalls = 0
  running = false

  onresult: ((e: RecognitionEvent) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null

  start(): void {
    // The real API throws InvalidStateError if start() is called while running.
    // The loop must never do that, so make it loud here.
    if (this.running) throw new Error('InvalidStateError: recognition already started')
    this.running = true
    this.startCalls++
  }

  stop(): void {
    this.stopCalls++
    this.running = false
  }

  abort(): void {
    this.abortCalls++
    this.running = false
  }

  emit(transcript: string, confidence: number, isFinal: boolean): void {
    this.onresult?.({ transcript, confidence, isFinal })
  }

  /** Chromium reports `confidence: 0` on interim results, so 0 means "unknown". */
  emitInterim(transcript: string, confidence = 0.9): void {
    this.emit(transcript, confidence, false)
  }

  emitFinal(transcript: string, confidence = 0.95): void {
    this.emit(transcript, confidence, true)
  }

  /** Chromium ends the recognition session on its own schedule, mid-turn. */
  spuriousEnd(): void {
    this.running = false
    this.onend?.()
  }
}

class FakeSynthesis implements SynthesisBackend {
  spoken: string[] = []
  cancels = 0
  cancelledAt: number | null = null
  private pending: (() => void)[] = []

  speak(text: string, onDone: () => void): void {
    this.spoken.push(text)
    this.pending.push(onDone)
  }

  cancel(): void {
    this.cancels++
    this.cancelledAt = Date.now()
    this.pending = []
  }

  get speaking(): boolean {
    return this.pending.length > 0
  }

  /** Simulate the current utterance reaching its end. */
  finish(): void {
    this.pending.shift()?.()
  }

  /** Drain every queued utterance, as a real synthesiser eventually would. */
  finishAll(limit = 20): void {
    for (let i = 0; i < limit && this.speaking; i++) this.finish()
  }
}

function scriptedAsk(tokens: string[]) {
  const calls: string[] = []
  const fn = (question: string): AsyncIterable<string> => {
    calls.push(question)
    return (async function* () {
      for (const t of tokens) yield t
    })()
  }
  return Object.assign(fn, { calls })
}

const ANSWER = [
  'Abdulrahman ',
  'is a senior frontend engineer. ',
  'He works in Istanbul.',
]

function harness(opts: { tokens?: string[]; silenceMs?: number } = {}) {
  const recognition = new FakeRecognition()
  const synthesis = new FakeSynthesis()
  const ask = scriptedAsk(opts.tokens ?? ANSWER)
  const states: VoiceState[] = []
  const transcripts: Array<{ text: string; final: boolean }> = []

  const loop = createVoiceLoop({
    ask,
    silenceMs: opts.silenceMs ?? 900,
    createRecognition: () => recognition,
    createSynthesis: () => synthesis,
  })
  loop.onState((s) => states.push(s))
  loop.onTranscript((text, final) => transcripts.push({ text, final }))

  return { loop, recognition, synthesis, ask, states, transcripts }
}

/** Runs one full turn up to the point where the loop is speaking the answer. */
async function driveToSpeaking(h: ReturnType<typeof harness>, question = 'tell me about recto') {
  h.loop.start()
  h.recognition.emitFinal(question)
  await vi.advanceTimersByTimeAsync(900)
  expect(h.loop.state).toBe('speaking')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ═══════════════════════════════════════════════════════════════════════ */

describe('voice loop', () => {
  it('moves idle → listening → thinking → speaking → listening across one turn', async () => {
    const h = harness()

    expect(h.loop.state).toBe('idle')

    h.loop.start()
    expect(h.loop.state).toBe('listening')
    expect(h.recognition.startCalls).toBe(1)

    h.recognition.emitInterim('what does he')
    h.recognition.emitFinal('what does he do')

    // Sustained silence is what ends the turn.
    await vi.advanceTimersByTimeAsync(900)

    expect(h.ask.calls).toEqual(['what does he do'])
    expect(h.synthesis.spoken.length).toBeGreaterThan(0)

    // Let every queued utterance play out.
    h.synthesis.finishAll()

    expect(h.states).toEqual(['listening', 'thinking', 'speaking', 'listening'])
  })

  it('speaks the answer in sentence-sized chunks so speech starts before the stream ends', async () => {
    const h = harness()
    await driveToSpeaking(h, 'who is he')

    // The first sentence must already be at the synthesiser, not the whole answer.
    expect(h.synthesis.spoken[0]).toBe('Abdulrahman is a senior frontend engineer.')
    h.synthesis.finishAll()
    expect(h.synthesis.spoken).toEqual([
      'Abdulrahman is a senior frontend engineer.',
      'He works in Istanbul.',
    ])
  })

  it('ends a turn on sustained silence, not on the API onend event', async () => {
    const h = harness()
    h.loop.start()

    h.recognition.emitFinal('who is he')

    // Chromium fires onend mid-turn. That is not the user finishing.
    h.recognition.spuriousEnd()
    await vi.advanceTimersByTimeAsync(890)
    expect(h.ask.calls).toEqual([])

    // The silence timer, and only the silence timer, closes the turn.
    await vi.advanceTimersByTimeAsync(20)
    expect(h.ask.calls).toEqual(['who is he'])
  })

  it('restarts recognition after a spurious onend without emitting a turn', async () => {
    const h = harness()
    h.loop.start()
    expect(h.recognition.startCalls).toBe(1)

    h.recognition.emitInterim('tell me about')
    h.recognition.spuriousEnd()

    // Restarted, still listening, no turn emitted.
    expect(h.recognition.startCalls).toBe(2)
    expect(h.recognition.running).toBe(true)
    expect(h.loop.state).toBe('listening')
    expect(h.ask.calls).toEqual([])

    // Audio captured after the restart still belongs to the same turn.
    h.recognition.emitFinal('tell me about recto')
    await vi.advanceTimersByTimeAsync(900)
    expect(h.ask.calls).toEqual(['tell me about recto'])
  })

  it('keeps restarting across repeated spurious onends while the loop is active', async () => {
    const h = harness()
    h.loop.start()

    for (let i = 0; i < 5; i++) h.recognition.spuriousEnd()

    expect(h.recognition.startCalls).toBe(6)
    expect(h.loop.state).toBe('listening')
    expect(h.ask.calls).toEqual([])
  })

  it('does not restart recognition after stop()', async () => {
    const h = harness()
    h.loop.start()
    h.loop.stop()

    expect(h.loop.state).toBe('idle')
    expect(h.recognition.abortCalls).toBe(1)

    h.recognition.spuriousEnd()
    expect(h.recognition.startCalls).toBe(1)
    expect(h.loop.state).toBe('idle')
  })

  it('cancels synthesis within 200ms when the user speaks over it', async () => {
    const h = harness()
    await driveToSpeaking(h)

    const t0 = Date.now()
    h.recognition.emitInterim('actually wait', 0.9)

    expect(h.synthesis.cancels).toBe(1)
    expect(h.synthesis.cancelledAt! - t0).toBeLessThan(200)
    expect(h.loop.state).toBe('listening')
  })

  it('carries the interrupting words into the new turn', async () => {
    const h = harness()
    await driveToSpeaking(h)

    h.recognition.emitInterim('actually wait', 0.9)
    h.recognition.emitFinal('actually wait tell me about asksheet', 0.95)
    await vi.advanceTimersByTimeAsync(900)

    expect(h.ask.calls[1]).toBe('actually wait tell me about asksheet')
  })

  it('abandons the interrupted answer instead of speaking it later', async () => {
    const h = harness()
    await driveToSpeaking(h)
    const spokenBefore = h.synthesis.spoken.length

    h.recognition.emitInterim('actually wait', 0.9)
    // Whatever the old turn had queued must never reach the synthesiser.
    await vi.advanceTimersByTimeAsync(50)
    expect(h.synthesis.spoken.length).toBe(spokenBefore)
    expect(h.loop.state).toBe('listening')
  })

  it('does not treat its own synthesised audio as user speech', async () => {
    const h = harness()
    await driveToSpeaking(h)
    expect(h.synthesis.spoken[0]).toBe('Abdulrahman is a senior frontend engineer.')

    // (a) The specified guard: a low-confidence result while answering is the
    //     loop hearing itself, not the visitor.
    h.recognition.emitInterim('abdulrahman is a senior', 0.2)
    expect(h.synthesis.cancels).toBe(0)
    expect(h.loop.state).toBe('speaking')

    // (b) Chromium reports confidence 0 on interim results, so the floor alone
    //     would either block every barge-in or let every echo through. When
    //     confidence is unknown, our own words coming back are recognisable by
    //     content.
    h.recognition.emitInterim('abdulrahman is a senior frontend engineer', 0)
    expect(h.synthesis.cancels).toBe(0)
    expect(h.loop.state).toBe('speaking')

    // (c) Unknown confidence but words we are not saying: a real interruption.
    h.recognition.emitInterim('stop stop stop', 0)
    expect(h.synthesis.cancels).toBe(1)
    expect(h.loop.state).toBe('listening')
  })

  it('never lets echoed audio become the next question', async () => {
    const h = harness()
    await driveToSpeaking(h)

    h.recognition.emitFinal('abdulrahman is a senior frontend engineer', 0.2)
    h.synthesis.finishAll()
    expect(h.loop.state).toBe('listening')

    // The echo must not be sitting in the buffer waiting to be asked.
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.ask.calls).toEqual(['tell me about recto'])
  })

  it('drops duplicate final results for the same utterance', async () => {
    const h = harness()
    h.loop.start()

    h.recognition.emitFinal('what does he do')
    // Chromium re-delivers the same final around a session restart.
    h.recognition.spuriousEnd()
    h.recognition.emitFinal('what does he do')
    h.recognition.emitFinal('What does he do.')

    await vi.advanceTimersByTimeAsync(900)

    expect(h.ask.calls).toEqual(['what does he do'])
  })

  it('still joins genuinely different finals within one turn', async () => {
    const h = harness()
    h.loop.start()

    h.recognition.emitFinal('what does he do')
    h.recognition.emitFinal('at cybernetic labs')
    await vi.advanceTimersByTimeAsync(900)

    expect(h.ask.calls).toEqual(['what does he do at cybernetic labs'])
  })

  it('reports interim and final transcripts to the UI', async () => {
    const h = harness()
    h.loop.start()

    h.recognition.emitInterim('what does')
    h.recognition.emitFinal('what does he do')

    expect(h.transcripts).toEqual([
      { text: 'what does', final: false },
      { text: 'what does he do', final: true },
    ])
  })

  it('does not fire a turn when the silence timer expires with nothing said', async () => {
    const h = harness()
    h.loop.start()

    await vi.advanceTimersByTimeAsync(5000)
    expect(h.ask.calls).toEqual([])
    expect(h.loop.state).toBe('listening')
  })

  it('routes typed questions through the same turn machinery', async () => {
    const h = harness()
    h.loop.start()

    h.loop.sendText('what does he do')
    await vi.advanceTimersByTimeAsync(0)

    expect(h.ask.calls).toEqual(['what does he do'])
    h.synthesis.finishAll()
    expect(h.loop.state).toBe('listening')
  })

  it('recovers to listening when the answer stream fails', async () => {
    const recognition = new FakeRecognition()
    const synthesis = new FakeSynthesis()
    const errors: unknown[] = []
    const loop = createVoiceLoop({
      ask: () =>
        (async function* () {
          throw new Error('rate limited')
          // eslint-disable-next-line no-unreachable
          yield ''
        })(),
      createRecognition: () => recognition,
      createSynthesis: () => synthesis,
      onError: (e) => errors.push(e),
    })

    loop.start()
    recognition.emitFinal('who is he')
    await vi.advanceTimersByTimeAsync(900)

    expect(errors).toHaveLength(1)
    expect(loop.state).toBe('listening')
  })

  it('stop() cancels synthesis and leaves nothing running', async () => {
    const h = harness()
    await driveToSpeaking(h)

    h.loop.stop()

    expect(h.synthesis.cancels).toBe(1)
    expect(h.recognition.abortCalls).toBe(1)
    expect(h.recognition.running).toBe(false)
    expect(h.loop.state).toBe('idle')
  })
})

describe('isSpeechSupported', () => {
  it('is false when the browser has no speech APIs', () => {
    expect(isSpeechSupported()).toBe(false)
  })

  it('is true only when both recognition and synthesis exist', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: function () {}, speechSynthesis: {} })
    expect(isSpeechSupported()).toBe(true)

    vi.stubGlobal('window', { webkitSpeechRecognition: function () {} })
    expect(isSpeechSupported()).toBe(false)

    vi.stubGlobal('window', { speechSynthesis: {} })
    expect(isSpeechSupported()).toBe(false)

    vi.unstubAllGlobals()
  })
})
