import { describe, it, expect } from 'vitest'
import { askConcierge, ConciergeError, parseSseTokens } from './ask'

async function* stream(...chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const t of it) out.push(t)
  return out
}

describe('parseSseTokens', () => {
  it('reads tokens from well-formed frames', async () => {
    expect(
      await collect(parseSseTokens(stream('data: "Hello"\n\ndata: " world"\n\ndata: [DONE]\n\n'))),
    ).toEqual(['Hello', ' world'])
  })

  it('reassembles a frame split across network chunks', async () => {
    // Chunks land wherever TCP puts them, not on frame boundaries.
    expect(
      await collect(parseSseTokens(stream('data: "Abdul', 'rahman is"', '\n\ndata: [DONE]\n\n'))),
    ).toEqual(['Abdulrahman is'])
  })

  it('handles several frames arriving in one chunk', async () => {
    expect(
      await collect(parseSseTokens(stream('data: "a"\n\ndata: "b"\n\ndata: "c"\n\n'))),
    ).toEqual(['a', 'b', 'c'])
  })

  it('stops at [DONE] and ignores anything after it', async () => {
    expect(
      await collect(parseSseTokens(stream('data: "a"\n\ndata: [DONE]\n\ndata: "b"\n\n'))),
    ).toEqual(['a'])
  })

  it('skips keep-alive comments and blank lines', async () => {
    expect(
      await collect(parseSseTokens(stream(': OPENROUTER PROCESSING\n\ndata: "a"\n\n'))),
    ).toEqual(['a'])
  })

  it('preserves newlines and quotes inside a token', async () => {
    expect(await collect(parseSseTokens(stream('data: "line\\none \\"quoted\\""\n\n')))).toEqual([
      'line\none "quoted"',
    ])
  })

  it('drops malformed frames rather than speaking protocol out loud', async () => {
    expect(await collect(parseSseTokens(stream('data: {oops\n\ndata: "ok"\n\n')))).toEqual(['ok'])
  })
})

describe('askConcierge', () => {
  const ok = (body: string) =>
    new Response(new Blob([body]).stream(), { status: 200 })

  it('posts the question and history and streams the answer', async () => {
    let seen: unknown
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = JSON.parse(init.body as string)
      return ok('data: "yes"\n\ndata: [DONE]\n\n')
    }) as unknown as typeof fetch

    const tokens = await collect(
      askConcierge('who is he', [{ role: 'user', content: 'hi' }], { fetchImpl }),
    )

    expect(tokens).toEqual(['yes'])
    expect(seen).toEqual({ question: 'who is he', history: [{ role: 'user', content: 'hi' }] })
  })

  it('surfaces the rate limit as something a visitor can act on', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'Too many questions' }), {
        status: 429,
      })) as unknown as typeof fetch

    const error = await collect(askConcierge('q', [], { fetchImpl })).catch((e) => e)

    expect(error).toBeInstanceOf(ConciergeError)
    expect((error as ConciergeError).status).toBe(429)
    expect((error as ConciergeError).friendly).toMatch(/email him directly/i)
  })

  it('reports a network failure as status 0 rather than throwing raw', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    const error = await collect(askConcierge('q', [], { fetchImpl })).catch((e) => e)

    expect(error).toBeInstanceOf(ConciergeError)
    expect((error as ConciergeError).status).toBe(0)
    expect((error as ConciergeError).friendly).toMatch(/could not reach/i)
  })
})
