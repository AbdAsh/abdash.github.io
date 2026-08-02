import { useCallback, useEffect, useRef, useState } from 'react'
import { askConcierge, ConciergeError, type Turn } from './ask'
import { createVoiceLoop, isSpeechSupported, type VoiceLoop, type VoiceState } from './voice'
import TextFallback from './TextFallback'
import './concierge.css'

/** Sessions are capped so an open tab cannot hold a microphone open all day. */
const SESSION_MS = 5 * 60 * 1000
/** The countdown only appears near the end — a timer running the whole time
 *  makes a conversation feel like an exam. */
const WARN_MS = 60 * 1000

const SUGGESTIONS = [
  'What does he do at Cybernetic Labs?',
  'What is he building on the AI tab?',
  'What is he strongest at?',
]

const STATUS: Record<VoiceState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

type Screen = 'idle' | 'voice' | 'text'

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
    </svg>
  )
}

export default function Concierge() {
  const [screen, setScreen] = useState<Screen>('idle')
  const [supported, setSupported] = useState(false)
  const [messages, setMessages] = useState<Turn[]>([])
  const [pending, setPending] = useState<string | undefined>()

  const [state, setState] = useState<VoiceState>('idle')
  const [interim, setInterim] = useState('')
  const [partial, setPartial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(SESSION_MS)

  const loopRef = useRef<VoiceLoop | null>(null)
  const historyRef = useRef<Turn[]>([])
  historyRef.current = messages
  const logRef = useRef<HTMLDivElement>(null)

  // Feature detection has to wait for the client; on the server there is no
  // window, and rendering "unsupported" into the static HTML would be wrong for
  // most visitors.
  useEffect(() => setSupported(isSpeechSupported()), [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages, partial, interim])

  const endVoice = useCallback(() => {
    loopRef.current?.stop()
    loopRef.current = null
    setInterim('')
    setPartial('')
    setState('idle')
  }, [])

  // Stop the microphone if the component goes away for any reason — a tab
  // switch, a navigation, a hot reload. Nothing should outlive the widget.
  useEffect(() => () => endVoice(), [endVoice])

  const startVoice = useCallback(
    (firstQuestion?: string) => {
      setError(null)
      setScreen('voice')
      setRemainingMs(SESSION_MS)

      let answer = ''
      const loop = createVoiceLoop({
        ask: (question) => {
          answer = ''
          setInterim('')
          setMessages((prev) => [...prev, { role: 'user', content: question }])
          return askConcierge(question, historyRef.current)
        },
        onAnswerToken: (token) => {
          answer += token
          setPartial(answer)
        },
        onError: (e) => {
          setError(
            e instanceof ConciergeError
              ? e.friendly
              : e instanceof Error && /not-allowed/.test(e.message)
                ? 'I need microphone access to listen. Enable it in your browser, or type your question instead.'
                : 'Something went wrong. You can keep going, or type your question instead.',
          )
        },
      })

      loop.onState((next) => {
        setState(next)
        // The answer is complete once the loop returns to listening.
        if (next === 'listening' && answer.trim()) {
          const done = answer.trim()
          answer = ''
          setPartial('')
          setMessages((prev) =>
            prev.at(-1)?.content === done ? prev : [...prev, { role: 'assistant', content: done }],
          )
        }
      })
      loop.onTranscript((text, final) => setInterim(final ? '' : text))

      loopRef.current = loop
      try {
        loop.start()
        if (firstQuestion) loop.sendText(firstQuestion)
      } catch {
        setError('I could not start the microphone. Type your question instead.')
        setScreen('text')
      }
    },
    [],
  )

  /** A suggestion chip: voice if the browser can, typed if it cannot. */
  const startWith = (question: string) => {
    if (supported) startVoice(question)
    else {
      setPending(question)
      setScreen('text')
    }
  }

  // Session cap.
  useEffect(() => {
    if (screen !== 'voice') return
    const deadline = Date.now() + SESSION_MS
    const tick = setInterval(() => {
      const left = deadline - Date.now()
      setRemainingMs(left)
      if (left <= 0) {
        endVoice()
        setScreen('text')
        setError('That is five minutes — the voice session has ended. You can keep going by typing.')
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [screen, endVoice])

  /* ── idle ─────────────────────────────────────────────────────────────── */

  if (screen === 'idle') {
    return (
      <div className="cg">
        <div className="cg-idle">
          <button
            className="cg-mic"
            onClick={() => (supported ? startVoice() : setScreen('text'))}
            aria-label={supported ? 'Start a voice conversation' : 'Start a typed conversation'}
          >
            <MicIcon />
          </button>
          <h3 className="cg-title">Interview my AI</h3>
          <p className="cg-sub">
            {supported
              ? 'Ask about his experience out loud. It answers from his CV, this site, and his project write-ups — and you can talk over it.'
              : 'Ask about his experience. It answers from his CV, this site, and his project write-ups.'}
          </p>
          <div className="cg-chips">
            {SUGGESTIONS.map((q) => (
              <button key={q} className="cg-chip" onClick={() => startWith(q)}>
                {q}
              </button>
            ))}
          </div>
          {supported && (
            <button className="cg-btn" onClick={() => setScreen('text')}>
              Type instead
            </button>
          )}
        </div>
        <PrivacyNote voice={supported} />
      </div>
    )
  }

  /* ── typed ────────────────────────────────────────────────────────────── */

  if (screen === 'text') {
    return (
      <div className="cg">
        <div className="cg-bar">
          <span className="cg-status" data-state="idle">
            <span className="cg-dot" />
            Typed
          </span>
          <span className="cg-spacer" />
          {supported && (
            <button className="cg-btn" onClick={() => startVoice()}>
              Switch to voice
            </button>
          )}
          <button
            className="cg-btn cg-btn-end"
            onClick={() => {
              setScreen('idle')
              setMessages([])
              setError(null)
            }}
          >
            End
          </button>
        </div>

        {!supported && (
          <p className="cg-note">
            This browser has no speech recognition, so the voice loop is unavailable here. It works
            in Chrome and Edge.
          </p>
        )}
        {error && (
          <div className="cg-alert" role="alert">
            {error}
          </div>
        )}

        <TextFallback
          messages={messages}
          setMessages={setMessages}
          autoFocus
          initialQuestion={pending}
        />
        <PrivacyNote voice={false} />
      </div>
    )
  }

  /* ── voice ────────────────────────────────────────────────────────────── */

  const showTimer = remainingMs <= WARN_MS
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))

  return (
    <div className="cg">
      <div className="cg-bar">
        <span className="cg-status" data-state={state}>
          <span className="cg-dot" />
          {STATUS[state]}
        </span>
        <span className="cg-spacer" />
        {showTimer && (
          <span className="cg-timer" role="timer">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} left
          </span>
        )}
        <button
          className="cg-btn"
          onClick={() => {
            endVoice()
            setScreen('text')
          }}
        >
          Type instead
        </button>
        <button
          className="cg-btn cg-btn-end"
          onClick={() => {
            endVoice()
            setScreen('idle')
            setMessages([])
          }}
        >
          End call
        </button>
      </div>

      {error && (
        <div className="cg-alert" role="alert">
          {error}
        </div>
      )}

      <div className="cg-log" ref={logRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`cg-msg cg-msg-${m.role}`}>
            {m.content}
          </div>
        ))}
        {partial && <div className="cg-msg cg-msg-assistant cg-caret">{partial}</div>}
        {interim && <div className="cg-interim">{interim}</div>}
        {!messages.length && !partial && !interim && (
          <p className="cg-note">Go ahead — ask about his experience. You can interrupt at any time.</p>
        )}
      </div>

      <PrivacyNote voice />
    </div>
  )
}

/**
 * The honest cost of free transport.
 *
 * Chromium's SpeechRecognition is not on-device: it streams microphone audio to
 * Google's servers. A visitor pressing a microphone button on a personal site
 * deserves to be told that before they speak, not in a policy page.
 */
function PrivacyNote({ voice }: { voice: boolean }) {
  return (
    <p className="cg-note">
      {voice
        ? 'Speech recognition runs through your browser’s provider — in Chrome and Edge that means audio is sent to Google. Speech output is generated on your device. '
        : ''}
      Questions go to a server function that answers from a fixed dossier. No conversation is
      stored, here or anywhere else.
    </p>
  )
}
