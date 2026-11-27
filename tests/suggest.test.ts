import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRoute, statusOf } from './helpers/nitro'

const ROUTE = '../server/api/suggest.post.ts'
const cfg = { resendApiKey: 're_test', suggestTo: 'owner@example.test, second@example.test' }
const good = { topic: 'Leader election', details: 'Raft vs Paxos', name: 'Ada', email: 'Ada@Example.com', startedAt: Date.now() - 10_000 }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('/api/suggest', () => {
  it('sends the email through Resend with parsed fields', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: good, config: cfg })
    const res = await handler({})
    expect(res.ok).toBe(true)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(opts.headers.Authorization).toBe('Bearer re_test')
    expect(opts.body.to).toEqual(['owner@example.test', 'second@example.test'])
    expect(opts.body.subject).toBe('Topic suggestion: Leader election')
    expect(opts.body.reply_to).toBe('ada@example.com')
    expect(opts.body.from).toContain('onboarding@resend.dev')
  })

  it('escapes HTML in the email body', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: { ...good, details: '<script>alert(1)</script>' }, config: cfg })
    await handler({})
    expect(fetchMock.mock.calls[0][1].body.html).not.toContain('<script>')
    expect(fetchMock.mock.calls[0][1].body.html).toContain('&lt;script&gt;')
  })

  it('rejects a too-short topic and a bad email', async () => {
    let r = await loadRoute(ROUTE, { body: { ...good, topic: 'ab' }, config: cfg })
    expect(await statusOf(r.handler({}))).toBe(422)
    r = await loadRoute(ROUTE, { body: { ...good, email: 'nope' }, config: cfg })
    expect(await statusOf(r.handler({}))).toBe(422)
    expect(r.fetchMock).not.toHaveBeenCalled()
  })

  it('silently drops honeypot, instant submits and link spam', async () => {
    for (const body of [
      { ...good, website: 'http://spam' },
      { ...good, startedAt: Date.now() },
      { ...good, details: 'http://a.co http://b.co http://c.co http://d.co' },
    ]) {
      const { handler, fetchMock } = await loadRoute(ROUTE, { body, config: cfg })
      expect((await handler({})).ok).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  })

  it('rate limits per IP after 3 suggestions', async () => {
    const { handler } = await loadRoute(ROUTE, { body: good, config: cfg, ip: '198.51.100.7' })
    for (let i = 0; i < 3; i++) await handler({})
    expect(await statusOf(handler({}))).toBe(429)
  })

  it('returns 503 when email is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: good, config: {} })
    expect(await statusOf(handler({}))).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 502 when Resend fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handler } = await loadRoute(ROUTE, { body: good, config: cfg, fetch: async () => { throw Object.assign(new Error('x'), { status: 500 }) } })
    expect(await statusOf(handler({}))).toBe(502)
  })
})
