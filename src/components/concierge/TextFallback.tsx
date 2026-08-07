import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { askConcierge, ConciergeError, type Turn } from './ask'

/**
 * The typed concierge.
 *
 * Reached two ways: automatically when the browser has no SpeechRecognition
 * (Safari and Firefox, which is most of the non-Chromium web), and by choice
 * from the voice panel's toggle for anyone who cannot talk out loud right now.
 * It is the same endpoint and the same agent — only the transport differs.
 */
export default function TextFallback({
  messages,
  setMessages,
  autoFocus = false,
  initialQuestion,
}: {
  messages: Turn[]
  setMessages: (update: (prev: Turn[]) => Turn[]) => void
  autoFocus?: boolean
  initialQuestion?: string
}) {
  const [draft, setDraft] = useState('')
  const [partial, setPartial] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Turn[]>(messages)
  historyRef.current = messages

  const ask = useCallback(
    async (question: string) => {
      setError(null)
      setBusy(true)
      setMessages((prev) => [...prev, { role: 'user', content: question }])

      let answer = ''
      try {
        for await (const token of askConcierge(question, historyRef.current)) {
          answer += token
          setPartial(answer)
        }
        if (answer.trim()) {
          setMessages((prev) => [...prev, { role: 'assistant', content: answer.trim() }])
        }
      } catch (e) {
        setError(
          e instanceof ConciergeError ? e.friendly : 'Something went wrong. Try again in a moment.',
        )
      } finally {
        setPartial('')
        setBusy(false)
      }
    },
    [setMessages],
  )

  // Fire a question the visitor chose before this panel existed (a suggestion
  // chip on the idle card), exactly once.
  const fired = useRef(false)
  useEffect(() => {
    if (initialQuestion && !fired.current) {
      fired.current = true
      void ask(initialQuestion)
    }
  }, [initialQuestion, ask])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages, partial])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const question = draft.trim()
    if (!question || busy) return
    setDraft('')
    void ask(question)
  }

  return (
    <>
      {(messages.length > 0 || partial) && (
        <div className="cg-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`cg-msg cg-msg-${m.role}`}>
              {m.content}
            </div>
          ))}
          {partial && <div className="cg-msg cg-msg-assistant cg-caret">{partial}</div>}
        </div>
      )}

      {error && (
        <div className="cg-alert" role="alert">
          {error}
        </div>
      )}

      <form className="cg-form" onSubmit={submit}>
        <input
          className="cg-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about his experience…"
          aria-label="Ask about his experience"
          maxLength={500}
          autoFocus={autoFocus}
          disabled={busy}
        />
        <button className="cg-send" type="submit" disabled={busy || !draft.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </>
  )
}
