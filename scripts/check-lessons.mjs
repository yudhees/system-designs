#!/usr/bin/env node
// Validates lesson files before they go live. Usage:
//   node scripts/check-lessons.mjs                 # all lessons
//   node scripts/check-lessons.mjs path/to/a.html  # specific files
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const dir = 'content/lessons'
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter(f => f.endsWith('.html')).map(f => join(dir, f))
const NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.html$/
let bad = 0
const slugs = new Map()

for (const f of files) {
  const errs = []
  const name = basename(f)
  if (!NAME.test(name)) errs.push('file name must look like 2026-11-27-idempotency-keys.html (lowercase, hyphens)')
  const size = statSync(f).size
  if (size > 3 * 1024 * 1024) errs.push(`file is ${(size / 1048576).toFixed(1)} MB; keep lessons under 3 MB`)
  const html = readFileSync(f, 'utf8')
  if (!/<title>[^<]+<\/title>/i.test(html)) errs.push('missing <title>')
  if (!/<h1[\s>]/i.test(html)) errs.push('missing <h1>')
  if (!/<\/html>\s*$/i.test(html.trim())) errs.push('file looks truncated (no closing </html>)')
  if (/<script[^>]+src=["'](?!https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\/)/i.test(html)) errs.push('external scripts must come from cdnjs, jsdelivr or unpkg')
  const slug = name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.html$/, '')
  if (slugs.has(slug)) errs.push(`slug "${slug}" already used by ${slugs.get(slug)}`)
  slugs.set(slug, name)
  if (errs.length) { bad++; console.error(`✗ ${f}\n  - ${errs.join('\n  - ')}`) } else console.log(`✓ ${f}`)
}
// Slugs must be unique across all lessons, not just the files passed in.
if (process.argv.slice(2).length) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const slug = f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.html$/, '')
    const owner = slugs.get(slug)
    if (owner && owner !== f) { bad++; console.error(`✗ slug "${slug}" is used by both ${owner} and ${f}`) }
  }
}
process.exit(bad ? 1 : 0)
