/**
 * Build-time content pipeline.
 *
 * Lessons: every `content/lessons/YYYY-MM-DD-<slug>.html` file is a complete,
 * self-contained lab page (the same HTML the daily scheduled task publishes).
 * We read metadata out of it, copy it to `/lab-files/<slug>.html`, and expose a
 * manifest to the app and server as `#content`.
 *
 * Articles: `content/articles/<slug>.md` with a small front-matter block.
 *
 * Adding a lesson therefore needs exactly one new file and no code changes.
 */
import { defineNuxtModule, addTemplate, addTypeTemplate } from 'nuxt/kit'
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { marked } from 'marked'

export interface LessonMeta {
  slug: string
  date: string
  title: string
  headline: string
  summary: string
  topic: string
  minutes: number
  sections: string[]
  sources: number
  file: string
}

export interface ArticleMeta {
  slug: string
  date: string
  title: string
  summary: string
  minutes: number
  html: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', times: '×', rarr: '→' }
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITIES[e.toLowerCase()] ?? m
  })
const text = (html: string) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const first = (html: string, re: RegExp) => { const m = html.match(re); return m ? text(m[1]) : '' }
const meta = (html: string, name: string) => {
  const m = html.match(new RegExp(`<meta[^>]+name=["']sdl:${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
  return m ? decode(m[1]).trim() : ''
}
const words = (s: string) => (s.match(/\S+/g) || []).length

export function parseLesson(file: string, html: string): LessonMeta {
  const base = basename(file, '.html')
  const m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/)
  if (!m) throw new Error(`Lesson file must be named YYYY-MM-DD-slug.html: ${file}`)
  const [, date, slug] = m
  const rawTitle = first(html, /<title>([\s\S]*?)<\/title>/i)
  // "System Design Lab — Consistent Hashing (2026-11-26)" -> "Consistent Hashing"
  const title = meta(html, 'title') || rawTitle.replace(/^System Design Lab\s*[—–-]\s*/i, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '') || slug
  const headline = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || title
  const summary = meta(html, 'summary') || first(html, /<p[^>]*class=["'][^"']*lede[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)
  // Eyebrow looks like "System Design Lab · 2026-11-26 · Partitioning"
  const eyebrow = first(html, /class=["'][^"']*eyebrow[^"']*["'][^>]*>([\s\S]*?)<\//i)
  const parts = eyebrow.split(/\s*[·|]\s*/)
  const topic = meta(html, 'topic') || (parts.length >= 3 ? parts[parts.length - 1] : 'System design')
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const minutes = Math.max(5, Math.round(words(text(body)) / 220) + 4) // +4 for playing with the simulator
  const sections = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(x => text(x[1])).filter(Boolean)
  const sources = (body.match(/<a\s[^>]*href=["']https?:/gi) || []).length
  return { slug, date, title, headline, summary, topic: topic.charAt(0).toUpperCase() + topic.slice(1), minutes, sections, sources, file: `/lab-files/${slug}.html` }
}

function parseArticle(file: string, src: string): ArticleMeta {
  const slug = basename(file, '.md')
  const fm: Record<string, string> = {}
  let body = src
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/)
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    body = src.slice(m[0].length)
  }
  return {
    slug,
    date: fm.date || '1970-01-01',
    title: fm.title || slug,
    summary: fm.summary || '',
    minutes: Math.max(1, Math.round(words(body) / 220)),
    html: marked.parse(body, { async: false }) as string,
  }
}

export function loadContent(root: string) {
  const lessonDir = join(root, 'content/lessons')
  const articleDir = join(root, 'content/articles')
  const lessons = existsSync(lessonDir)
    ? readdirSync(lessonDir).filter(f => f.endsWith('.html')).map(f => ({ meta: parseLesson(f, readFileSync(join(lessonDir, f), 'utf8')), path: join(lessonDir, f) }))
    : []
  const articles = existsSync(articleDir)
    ? readdirSync(articleDir).filter(f => f.endsWith('.md')).map(f => parseArticle(f, readFileSync(join(articleDir, f), 'utf8')))
    : []
  lessons.sort((a, b) => b.meta.date.localeCompare(a.meta.date))
  articles.sort((a, b) => b.date.localeCompare(a.date))
  const seen = new Set<string>()
  for (const l of lessons) {
    if (seen.has(l.meta.slug)) throw new Error(`Duplicate lesson slug: ${l.meta.slug}`)
    seen.add(l.meta.slug)
  }
  return { lessons, articles }
}

export default defineNuxtModule({
  meta: { name: 'sdl-content' },
  setup(_, nuxt) {
    const root = nuxt.options.rootDir
    const outDir = resolve(nuxt.options.buildDir, 'lab-files')
    const build = () => {
      const { lessons, articles } = loadContent(root)
      rmSync(outDir, { recursive: true, force: true })
      mkdirSync(outDir, { recursive: true })
      for (const l of lessons) writeFileSync(join(outDir, `${l.meta.slug}.html`), readFileSync(l.path))
      return { lessons: lessons.map(l => l.meta), articles }
    }
    let data = build()

    const tpl = addTemplate({
      filename: 'sdl-content.mjs',
      write: true,
      getContents: () => {
        data = build()
        return `export const lessons = ${JSON.stringify(data.lessons)}\nexport const articles = ${JSON.stringify(data.articles)}\n`
      },
    })
    addTypeTemplate({
      filename: 'types/sdl-content.d.ts',
      getContents: () => `declare module '#content' {
  export interface LessonMeta { slug: string; date: string; title: string; headline: string; summary: string; topic: string; minutes: number; sections: string[]; sources: number; file: string }
  export interface ArticleMeta { slug: string; date: string; title: string; summary: string; minutes: number; html: string }
  export const lessons: LessonMeta[]
  export const articles: ArticleMeta[]
}`,
    })
    nuxt.options.alias['#content'] = tpl.dst

    nuxt.options.nitro.publicAssets ||= []
    nuxt.options.nitro.publicAssets.push({ dir: outDir, baseURL: '/lab-files', maxAge: 60 * 60 })

    nuxt.hook('nitro:config', (cfg) => {
      cfg.alias ||= {}
      cfg.alias['#content'] = tpl.dst
      cfg.prerender ||= {}
      cfg.prerender.routes ||= []
      cfg.prerender.routes.push(
        ...data.lessons.map(l => `/labs/${l.slug}`),
        ...data.articles.map(a => `/articles/${a.slug}`),
      )
    })

    nuxt.options.watch.push(join(root, 'content'))
  },
})
