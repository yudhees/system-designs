#!/usr/bin/env node
// Validates lab files before they go live. Usage:
//   node scripts/check-lessons.mjs                       # all labs
//   node scripts/check-lessons.mjs app/labs/a.vue ...    # specific files
// Native labs are Vue components in app/labs/*.vue. Older labs are standalone HTML in content/lessons/*.html.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const DIRS = ['app/labs', 'content/lessons']
const ext = f => (f.endsWith('.vue') ? 'vue' : 'html')
const all = DIRS.flatMap(d => (existsSync(d) ? readdirSync(d).filter(f => /\.(vue|html)$/.test(f)).map(f => join(d, f)) : []))
const files = process.argv.slice(2).length ? process.argv.slice(2) : all
const NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.(vue|html)$/
const slugOf = n => n.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(vue|html)$/, '')
let bad = 0
const slugs = new Map()

for (const f of files) {
  const errs = []
  const name = basename(f)
  if (!NAME.test(name)) errs.push('file name must look like 2026-11-27-idempotency-keys.vue (lowercase, hyphens)')
  const size = statSync(f).size
  if (size > 3 * 1024 * 1024) errs.push(`file is ${(size / 1048576).toFixed(1)} MB; keep labs under 3 MB`)
  const src = readFileSync(f, 'utf8')
  if (ext(f) === 'vue') {
    if (!f.replace(/\\/g, '/').includes('app/labs/')) errs.push('native labs live in app/labs/')
    if (!/<template>[\s\S]*<\/template>/.test(src)) errs.push('missing <template>')
    if (!/<div class="labdoc">/.test(src)) errs.push('the template root must be <div class="labdoc">')
    if (!/<h1[\s>]/i.test(src)) errs.push('missing <h1>')
    if (!/<!--\s*sdl:topic:/i.test(src)) errs.push('missing <!-- sdl:topic: ... --> comment')
    if (!/<!--\s*sdl:title:/i.test(src)) errs.push('missing <!-- sdl:title: ... --> comment')
    if (/<script[^>]+src=/i.test(src)) errs.push('no <script src>: write the simulator in <script setup lang="ts">')
    if (/\bimport\s[^'"]*from\s*['"](?!vue['"])/.test(src.replace(/<template>[\s\S]*<\/template>/, ''))) errs.push('labs may only import from "vue" (everything else is auto-imported); add no packages')
    if (/v-html/.test(src)) errs.push('do not use v-html')
    if (!/<style scoped>/.test(src)) console.log(`  (note) ${f} has no <style scoped>; fine if the shared lab classes are enough`)
  } else {
    if (!/<title>[^<]+<\/title>/i.test(src)) errs.push('missing <title>')
    if (!/<h1[\s>]/i.test(src)) errs.push('missing <h1>')
    if (!/<\/html>\s*$/i.test(src.trim())) errs.push('file looks truncated (no closing </html>)')
    if (/<script[^>]+src=["'](?!https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\/)/i.test(src)) errs.push('external scripts must come from cdnjs, jsdelivr or unpkg')
  }
  const slug = slugOf(name)
  if (slugs.has(slug)) errs.push(`slug "${slug}" already used by ${slugs.get(slug)}`)
  slugs.set(slug, name)
  if (errs.length) { bad++; console.error(`✗ ${f}\n  - ${errs.join('\n  - ')}`) } else console.log(`✓ ${f}`)
}
// Slugs must be unique across all labs, not just the files passed in.
if (process.argv.slice(2).length) {
  for (const f of all) {
    const n = basename(f)
    const owner = slugs.get(slugOf(n))
    if (owner && owner !== n) { bad++; console.error(`✗ slug "${slugOf(n)}" is used by both ${owner} and ${n}`) }
  }
}
process.exit(bad ? 1 : 0)
