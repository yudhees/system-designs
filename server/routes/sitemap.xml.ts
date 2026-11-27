import { lessons, articles } from '#content'

export default defineEventHandler((event) => {
  const site = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  const urls = [
    { loc: '/', lastmod: lessons[0]?.date },
    { loc: '/labs', lastmod: lessons[0]?.date },
    { loc: '/articles', lastmod: articles[0]?.date },
    { loc: '/about' },
    { loc: '/suggest' },
    ...lessons.map(l => ({ loc: `/labs/${l.slug}`, lastmod: l.date })),
    ...articles.map(a => ({ loc: `/articles/${a.slug}`, lastmod: a.date })),
  ]
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${site}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`
})
