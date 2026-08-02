/**
 * Transport for the concierge: one turn against the `concierge-turn` Edge
 * Function, streamed back as answer tokens.
 */

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export class ConciergeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ConciergeError'
  }

  /** Messages safe and useful to show a visitor, per status. */
  get friendly(): string {
    if (this.status === 429) {
      return 'That is as many questions as I can take from one visitor this hour. Email him directly and he will answer himself.'
    }
    if (this.status === 0) {
      return 'I could not reach the server. Check your connection and try again.'
    }
    return 'Something went wrong on my side. Try again in a moment.'
  }
}

export const CONCIERGE_ENDPOINT =
  'https://jayflvpyrdvqhmftiokp.supabase.co/functions/v1/concierge-turn'

/**
 * Turns a stream of raw SSE text into answer tokens.
 *
 * Split out from `fetch` so the framing is testable. The case that matters is a
 * frame arriving in pieces: network chunks fall wherever TCP puts them, not on
 * frame boundaries, so a parser that assumes one chunk is one frame will
 * silently drop tokens under exactly the conditions that are hardest to
 * reproduce by hand.
 */
export async function* parseSseTokens(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  let buffer = ''

  for await (const chunk of chunks) {
    buffer += chunk

    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)

      if (!line || line.startsWith(':') || !line.startsWith('data:')) continue

      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return

      try {
        const token = JSON.parse(payload) as unknown
        if (typeof token === 'string' && token) yield token
      } catch {
        // A frame that is not valid JSON is not a token. Skipping is right:
        // the alternative is speaking a fragment of protocol out loud.
      }
    }
  }
}

async function* decode(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

export interface AskOptions {
  endpoint?: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** One turn. Yields answer tokens as they arrive. */
export async function* askConcierge(
  question: string,
  history: Turn[],
  options: AskOptions = {},
): AsyncIterable<string> {
  const doFetch = options.fetchImpl ?? fetch
  let response: Response

  try {
    response = await doFetch(options.endpoint ?? CONCIERGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
      signal: options.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ConciergeError((e as Error)?.message ?? 'Network error', 0)
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // Non-JSON error body; the status is enough.
    }
    throw new ConciergeError(message, response.status)
  }

  if (!response.body) throw new ConciergeError('Empty response', response.status)

  yield* parseSseTokens(decode(response.body))
}
