import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRoute, statusOf } from './helpers/nitro'

const ROUTE = '../server/api/subscribe.post.ts'
const kit = { newsletterProvider: 'kit', kitApiKey: 'kit_test' }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('/api/subscribe', () => {
  it('rejects invalid emails', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: { email: 'not-an-email' }, config: kit })
    expect(await statusOf(handler({}))).toBe(422)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pretends success for the honeypot without calling Kit', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: { email: 'a@b.co', company: 'Bot Inc' }, config: kit })
    expect((await handler({})).ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('without a form ID adds an active subscriber directly', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: { email: ' Me@Example.COM ' }, config: kit })
    const res = await handler({})
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.kit.com/v4/subscribers')
    expect(opts.headers['X-Kit-Api-Key']).toBe('kit_test')
    expect(opts.body).toEqual({ email_address: 'me@example.com', state: 'active' })
  })

  it('with a form ID creates an inactive subscriber then adds them to the form', async () => {
    const { handler, fetchMock } = await loadRoute(ROUTE, { body: { email: 'me@example.com', source: 'Home Page!' }, config: { ...kit, kitFormId: '123' } })
    const res = await handler({})
    expect(res.message).toMatch(/confirm/i)
    expect(fetchMock.mock.calls[0][1].body.state).toBe('inactive')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.kit.com/v4/forms/123/subscribers')
    expect(fetchMock.mock.calls[1][1].body.referrer).toBe('https://example.test//?src=homepage')
  })

  it('returns 503 when Kit has no API key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handler } = await loadRoute(ROUTE, { body: { email: 'me@example.com' }, config: { newsletterProvider: 'kit' } })
    expect(await statusOf(handler({}))).toBe(503)
  })

  it('maps Kit failures to 502, and a Kit 422 to 422', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let r = await loadRoute(ROUTE, { body: { email: 'me@example.com' }, config: kit, fetch: async () => { throw Object.assign(new Error(), { status: 500 }) } })
    expect(await statusOf(r.handler({}))).toBe(502)
    r = await loadRoute(ROUTE, { body: { email: 'me@example.com' }, config: kit, fetch: async () => { throw Object.assign(new Error(), { status: 422 }) } })
    expect(await statusOf(r.handler({}))).toBe(422)
  })

  it('rate limits after 5 attempts per IP', async () => {
    const { handler } = await loadRoute(ROUTE, { body: { email: 'me@example.com' }, config: kit, ip: '198.51.100.9' })
    for (let i = 0; i < 5; i++) await handler({})
    expect(await statusOf(handler({}))).toBe(429)
  })
})
