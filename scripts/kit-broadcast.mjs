#!/usr/bin/env node
// Creates a Kit broadcast announcing new lessons.
// Usage: node scripts/kit-broadcast.mjs content/lessons/2026-11-27-foo.html [...]
// Env: KIT_API_KEY (required), SITE_URL, KIT_BROADCAST_MODE = "draft" (default) | "send"
//   draft: saved in Kit for you to review and send.
//   send:  scheduled two minutes from now, to all subscribers.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const key = process.env.KIT_API_KEY
if (!key) { console.log('KIT_API_KEY not set; skipping newsletter broadcast.'); process.exit(0) }
const site = (process.env.SITE_URL || 'https://sdl-daily.vercel.app').replace(/\/$/, '')
const mode = process.env.KIT_BROADCAST_MODE === 'send' ? 'send' : 'draft'

const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

for (const file of process.argv.slice(2)) {
  const html = readFileSync(file, 'utf8')
  const slug = basename(file, '.html').replace(/^\d{4}-\d{2}-\d{2}-/, '')
  const title = strip(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || slug).replace(/^System Design Lab\s*[—–-]\s*/i, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '')
  const headline = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || title)
  const lede = strip(html.match(/<p[^>]*class=["'][^"']*lede[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '')
  const url = `${site}/labs/${slug}?utm_source=newsletter`
  const content = `<h2>${esc(headline)}</h2>${lede ? `<p>${esc(lede)}</p>` : ''}<p>Today's lab walks through a real incident, the concept behind the fix, a live simulator you can break, and a design problem with a model answer.</p><p><a href="${url}"><strong>Open the lab</strong></a></p>`
  const now = new Date()
  const body = {
    subject: `New lab: ${title}`,
    preview_text: lede.slice(0, 140) || headline,
    description: `Lab announcement: ${slug}`,
    content,
    public: false,
    published_at: now.toISOString(),
    send_at: mode === 'send' ? new Date(now.getTime() + 2 * 60_000).toISOString() : null,
    subscriber_filter: [{ all: null, any: null, none: null }],
  }
  const res = await fetch('https://api.kit.com/v4/broadcasts', {
    method: 'POST',
    headers: { 'X-Kit-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) { console.error(`Kit broadcast failed for ${slug}: ${res.status} ${text}`); process.exitCode = 1; continue }
  console.log(`Kit broadcast ${mode === 'send' ? 'scheduled' : 'saved as draft'} for ${slug}`)
}
