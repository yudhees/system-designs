import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRoute } from './helpers/nitro'

// Deliberately unsorted: the routes must order by date themselves.
vi.mock('#content', () => ({
  lessons: [
    { slug: 'new-lab', date: '2026-11-27', title: 'New Lab', headline: 'New Lab: a & b', summary: 'S <1>', topic: 'Caching' },
    { slug: 'old-lab', date: '2026-11-24', title: 'Old', headline: 'A different story', summary: 'S2', topic: 'Scaling' },
  ],
  articles: [{ slug: 'how-to', date: '2026-11-26', title: 'How to study', summary: 'A', topic: undefined }],
}))

afterEach(() => vi.unstubAllGlobals())

describe('rss.xml', () => {
  it('uses the site domain, escapes text and orders newest first', async () => {
    const { handler, headers } = await loadRoute('../server/routes/rss.xml.ts', {})
    const xml: string = handler({})
    expect(headers['Content-Type']).toContain('application/rss+xml')
    expect(xml).toContain('<link>https://example.test</link>')
    expect(xml).toContain('<atom:link href="https://example.test/rss.xml"')
    expect(xml).not.toContain('example.test//')
    expect(xml).toContain('<link>https://example.test/labs/new-lab</link>')
    expect(xml).toContain('<link>https://example.test/articles/how-to</link>')
    expect(xml).toContain('S &lt;1&gt;')
    const order = ['new-lab', 'how-to', 'old-lab'].map(s => xml.indexOf(`/${s}</link>`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every(i => i > 0)).toBe(true)
  })

  it('uses the headline alone when it starts with the title, else prefixes the title, and sets pubDate/lastBuildDate', async () => {
    const { handler } = await loadRoute('../server/routes/rss.xml.ts', {})
    const xml: string = handler({})
    expect(xml).toContain('<title>New Lab: a &amp; b</title>')
    expect(xml).toContain('<title>Old: A different story</title>')
    // 06:30 IST = 01:00 UTC
    expect(xml).toContain('<pubDate>Fri, 27 Nov 2026 01:00:00 GMT</pubDate>')
    expect(xml).toContain('<lastBuildDate>Fri, 27 Nov 2026 01:00:00 GMT</lastBuildDate>')
  })
})

describe('sitemap.xml', () => {
  it('lists static pages, labs and articles on the site domain with lastmod', async () => {
    const { handler, headers } = await loadRoute('../server/routes/sitemap.xml.ts', {})
    const xml: string = handler({})
    expect(headers['Content-Type']).toContain('application/xml')
    for (const p of ['/', '/labs', '/articles', '/about', '/suggest', '/labs/new-lab', '/labs/old-lab', '/articles/how-to']) {
      expect(xml).toContain(`<loc>https://example.test${p}</loc>`)
    }
    expect(xml).toContain('<loc>https://example.test/labs/old-lab</loc><lastmod>2026-11-24</lastmod>')
    expect(xml).not.toContain('example.test//')
  })
})
