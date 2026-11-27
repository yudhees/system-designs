import { describe, it, expect } from 'vitest'
import { loadContent, parseLesson } from '../modules/content'
import { topicColor, formatDate } from '../app/composables/useTopics'

// Uses the real files in content/, so a malformed new lesson fails CI.
const { lessons, articles } = loadContent(process.cwd())

describe('lesson data', () => {
  it('loads lessons newest first, so the home page picks the newest lab', () => {
    expect(lessons.length).toBeGreaterThan(0)
    const dates = lessons.map(l => l.meta.date)
    expect(dates).toEqual([...dates].sort().reverse())
    // index.vue: latest = lessons[0]
    expect(lessons[0].meta.date).toBe(dates[0])
  })

  it('about page lab path is oldest first (reverse of the list)', () => {
    const path = [...lessons.map(l => l.meta)].reverse()
    expect(path[0].date <= path[path.length - 1].date).toBe(true)
    expect(path).toHaveLength(lessons.length)
  })

  it('every lesson has usable metadata and a unique slug', () => {
    const slugs = new Set<string>()
    for (const { meta: m } of lessons) {
      expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(m.title.length).toBeGreaterThan(0)
      expect(m.headline.length).toBeGreaterThan(0)
      expect(m.minutes).toBeGreaterThanOrEqual(5)
      expect(m.file).toBe(`/lab-files/${m.slug}.html`)
      expect(slugs.has(m.slug)).toBe(false)
      slugs.add(m.slug)
    }
  })

  it('articles are newest first', () => {
    const d = articles.map(a => a.date)
    expect(d).toEqual([...d].sort().reverse())
  })
})

describe('parseLesson', () => {
  const html = `<html><head><title>System Design Lab — Consistent Hashing (2026-11-26)</title></head>
    <body><p class="eyebrow">System Design Lab · 2026-11-26 · partitioning</p><h1>Why one node melted</h1>
    <p class="lede">A short hook &amp; more.</p><h2>Part A</h2><h2>Part B</h2><a href="https://x.dev">src</a></body></html>`

  it('extracts fields from the HTML and file name', () => {
    const m = parseLesson('2026-11-26-consistent-hashing.html', html)
    expect(m).toMatchObject({ slug: 'consistent-hashing', date: '2026-11-26', title: 'Consistent Hashing', headline: 'Why one node melted', summary: 'A short hook & more.', topic: 'Partitioning', sections: ['Part A', 'Part B'], sources: 1 })
  })

  it('prefers sdl:* meta tags', () => {
    const m = parseLesson('2026-01-02-x.html', `<title>T</title><meta name="sdl:topic" content="Queues"><meta name="sdl:summary" content="Hi"><h1>H</h1>`)
    expect(m.topic).toBe('Queues')
    expect(m.summary).toBe('Hi')
  })

  it('rejects badly named files', () => {
    expect(() => parseLesson('idempotency.html', html)).toThrow(/YYYY-MM-DD/)
  })
})

describe('topic helpers', () => {
  it('topicColor is stable and case-insensitive', () => {
    expect(topicColor('Caching')).toBe(topicColor('caching'))
    expect(topicColor('Caching')).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('formatDate formats in UTC', () => {
    expect(formatDate('2026-11-27')).toBe('27 Nov 2026')
  })
})
