import { lessons, articles } from '#content'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default defineEventHandler((event) => {
  const site = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  const items = [
    ...lessons.map(l => ({ title: `${l.title}: ${l.headline}`, link: `${site}/labs/${l.slug}`, date: l.date, desc: l.summary, cat: l.topic })),
    ...articles.map(a => ({ title: a.title, link: `${site}/articles/${a.slug}`, date: a.date, desc: a.summary, cat: 'Article' })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  setHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>System Design Lab</title>
<link>${site}</link>
<description>Free, interactive system design labs built from real engineering incidents.</description>
<language>en</language>
<atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
${items.map(i => `<item><title>${esc(i.title)}</title><link>${i.link}</link><guid>${i.link}</guid><pubDate>${new Date(i.date + 'T06:30:00+05:30').toUTCString()}</pubDate><category>${esc(i.cat)}</category><description>${esc(i.desc)}</description></item>`).join('\n')}
</channel>
</rss>`
})
