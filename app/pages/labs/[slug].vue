<script setup lang="ts">
import type { Component } from 'vue'
import { lessons } from '#content'
const route = useRoute()
const idx = lessons.findIndex(l => l.slug === route.params.slug)
if (idx < 0) throw createError({ statusCode: 404, statusMessage: 'Lab not found', fatal: true })
const lab = lessons[idx]
const newer = lessons[idx - 1]
const older = lessons[idx + 1]
const { isDone, toggle } = useProgress()
const theme = useState<'system' | 'light' | 'dark'>('sdl-theme', () => 'system')

useSeoMeta({
  title: lab.title,
  description: lab.summary,
  ogTitle: `${lab.title}: ${lab.headline}`,
  ogDescription: lab.summary,
  ogType: 'article',
})
if (!lab.native) useHead({ link: [{ rel: 'preload', href: lab.file, as: 'document' }] })

// Native labs are Vue components in app/labs, rendered inline with the site's own styles and
// tokens. They are loaded lazily and render on the server like any page; their simulators start
// in the browser once mounted.
const loaders = import.meta.glob('../../labs/*.vue')
const LabBody = lab.native ? defineAsyncComponent(loaders[`../../labs/${lab.date}-${lab.slug}.vue`] as () => Promise<Component>) : null
const labEl = ref<HTMLElement>()

// Legacy labs are complete standalone pages, so they run in an
// iframe (same origin). We size the frame to its content so the page scrolls
// as one, and pass the site theme through.
const frame = ref<HTMLIFrameElement>()
const height = ref(1400)
let ro: ResizeObserver | undefined
let tocObserver: MutationObserver | undefined
function syncTheme() {
  const doc = frame.value?.contentDocument
  if (!doc) return
  if (theme.value === 'system') delete doc.documentElement.dataset.theme
  else doc.documentElement.dataset.theme = theme.value
}
function onLoad() {
  const doc = frame.value?.contentDocument
  if (!doc) return
  syncTheme()
  const measure = () => { height.value = Math.max(600, doc.documentElement.scrollHeight); spy() }
  measure()
  buildToc()
  ro?.disconnect()
  ro = new ResizeObserver(measure)
  ro.observe(doc.body)
  // Links inside the lab open outside the frame.
  doc.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href')!.startsWith('#')) a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener') })
}
watch(theme, syncTheme)

// "On this page": built from each lab's own sections, so new labs get it for free.
interface Sec { id: string, label: string, el: HTMLElement }
const secs = ref<Sec[]>([])
const active = ref('')
const progress = ref(0)
const menu = ref<HTMLDetailsElement>()
function buildToc() {
  const root: ParentNode | undefined = lab.native ? labEl.value : frame.value?.contentDocument ?? undefined
  if (!root) return
  const out: Sec[] = []
  root.querySelectorAll<HTMLElement>(lab.native ? 'section' : 'body section').forEach((el, i) => {
    const h = el.querySelector('h2')
    if (!h) return
    const eyebrow = el.querySelector('.eyebrow')?.textContent?.trim()
    const label = eyebrow || h.textContent?.trim() || `Section ${i + 1}`
    const id = el.id || `sec-${i + 1}`
    out.push({ id, label, el })
  })
  secs.value = out
  spy()
}
function frameTop() { return lab.native ? 0 : (frame.value?.getBoundingClientRect().top ?? 0) }
function spy() {
  const ft = frameTop()
  let cur = ''
  for (const s of secs.value) if (ft + s.el.getBoundingClientRect().top <= 140) cur = s.id
  active.value = cur
  if (lab.native) {
    const r = labEl.value?.getBoundingClientRect()
    const total = (r?.height ?? 0) - window.innerHeight
    progress.value = r && total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0
    return
  }
  const total = height.value - window.innerHeight
  progress.value = total > 0 ? Math.min(1, Math.max(0, -ft / total)) : 0
}
function go(s: Sec) {
  const y = window.scrollY + frameTop() + s.el.getBoundingClientRect().top - 84
  window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  if (menu.value) menu.value.open = false
}
onMounted(() => {
  window.addEventListener('scroll', spy, { passive: true }); window.addEventListener('resize', spy)
  if (lab.native) {
    // The lab body loads lazily; build the contents list once it has rendered.
    const el = labEl.value
    if (el) {
      buildToc()
      if (!secs.value.length) {
        tocObserver = new MutationObserver(() => { buildToc(); if (secs.value.length) { tocObserver?.disconnect(); tocObserver = undefined } })
        tocObserver.observe(el, { childList: true, subtree: true })
      }
    }
  }
})
onBeforeUnmount(() => { ro?.disconnect(); tocObserver?.disconnect(); window.removeEventListener('scroll', spy); window.removeEventListener('resize', spy) })
</script>

<template>
  <article class="labpage">
    <header class="wrap top">
      <nav class="crumbs" aria-label="Breadcrumb"><NuxtLink to="/labs">Labs</NuxtLink><span aria-hidden="true">/</span><NuxtLink :to="{ path: '/labs', query: { topic: lab.topic } }">{{ lab.topic }}</NuxtLink></nav>
      <div class="facts">
        <time :datetime="lab.date">{{ formatDate(lab.date, { day: 'numeric', month: 'long', year: 'numeric' }) }}</time>
        <span>{{ lab.minutes }} min</span>
        <span>{{ lab.sources }} sources</span>
        <ClientOnly>
          <button type="button" :class="['mark', { on: isDone(lab.slug) }]" :aria-pressed="isDone(lab.slug)" @click="toggle(lab.slug)">
            {{ isDone(lab.slug) ? '✓ Done' : 'Mark as done' }}
          </button>
        </ClientOnly>
      </div>
    </header>

    <div class="progress" aria-hidden="true"><i :style="{ transform: `scaleX(${progress})` }" /></div>

    <details v-if="secs.length" ref="menu" class="mtoc">
      <summary>On this page <span class="muted">{{ secs.find(x => x.id === active)?.label }}</span></summary>
      <ol>
        <li v-for="x in secs" :key="x.id"><a href="#" :class="{ on: x.id === active }" @click.prevent="go(x)">{{ x.label }}</a></li>
      </ol>
    </details>

    <div :class="['stage', 'wrap', { legacy: !lab.native }]">
      <div v-if="LabBody" ref="labEl" class="native"><component :is="LabBody" /></div>
      <iframe v-else ref="frame" :src="lab.file" :title="`${lab.title} lab`" :style="{ height: `${height}px` }" class="frame" @load="onLoad" />
      <aside v-if="secs.length" class="toc" aria-label="On this page">
        <p class="cap">On this page</p>
        <ol>
          <li v-for="x in secs" :key="x.id"><a href="#" :class="{ on: x.id === active }" :aria-current="x.id === active ? 'true' : undefined" @click.prevent="go(x)">{{ x.label }}</a></li>
        </ol>
        <p class="pct muted">{{ Math.round(progress * 100) }}% read</p>
      </aside>
    </div>

    <footer class="wrap end">
      <div class="done-row">
        <ClientOnly>
          <button type="button" :class="['btn', isDone(lab.slug) ? '' : 'btn-primary']" @click="toggle(lab.slug)">{{ isDone(lab.slug) ? '✓ Marked as done' : 'Mark this lab as done' }}</button>
        </ClientOnly>
        <a v-if="!lab.native" :href="lab.file" target="_blank" rel="noopener" class="muted">Open the lab on its own page</a>
      </div>

      <nav class="pager" aria-label="More labs">
        <NuxtLink v-if="older" :to="`/labs/${older.slug}`" class="pg prev"><span class="muted">Previous lab</span><b>{{ older.title }}</b></NuxtLink>
        <span v-else />
        <NuxtLink v-if="newer" :to="`/labs/${newer.slug}`" class="pg next"><span class="muted">Next lab</span><b>{{ newer.title }}</b></NuxtLink>
      </nav>

      <section class="sub" aria-labelledby="lab-sub">
        <h2 id="lab-sub">Get the next lab by email</h2>
        <NewsletterForm :source="`lab-${lab.slug}`" />
      </section>
    </footer>
  </article>
</template>

<style scoped>
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 24px; padding-block: 18px; }
.crumbs { display: flex; gap: 8px; font-size: .92rem; }
.crumbs a { color: var(--muted); text-decoration: none; }
.crumbs a:hover { color: var(--signal); }
.crumbs span { color: var(--line); }
.facts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; font-size: .9rem; color: var(--muted); }
.mark { font: 600 .88rem var(--f-body); background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.mark:hover { border-color: var(--ink); }
.mark.on { color: var(--ok); border-color: var(--ok); }
.frame { display: block; width: 100%; border: 0; background: transparent; animation: fade .5s ease both; }
.end { display: grid; gap: 40px; margin-top: 24px; }
.done-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pg { display: grid; gap: 4px; padding: 18px 20px; border: 1.5px solid var(--line); border-radius: var(--r-md); text-decoration: none; color: var(--ink); }
.pg:hover { border-color: var(--ink); }
.pg b { font-family: var(--f-display); font-size: 1.15rem; }
.next { text-align: right; }
.sub { display: grid; gap: 14px; background: var(--signal-soft); border-radius: var(--r-lg); padding: 32px; }
.sub h2 { font-size: 1.5rem; }

.progress { position: fixed; top: 64px; left: 0; right: 0; height: 3px; z-index: 40; pointer-events: none; }
.progress i { transition: transform .12s linear; display: block; height: 100%; background: var(--signal); transform-origin: left; transform: scaleX(0); }
.stage { display: block; }
/* the lab document keeps its own 16px side padding, so trim the container's to line text up with the header */
.stage.legacy { padding-inline: max(0px, calc(var(--gutter) - 16px)); }
.native { min-width: 0; padding-bottom: 24px; }
.toc, .mtoc { display: none; }
.toc ol, .mtoc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.toc a, .mtoc a { transition: color .2s, border-color .2s, background-color .2s, padding-left .2s; display: block; padding: 7px 12px; border-left: 2px solid var(--line); color: var(--muted); text-decoration: none; font-size: .92rem; }
.toc a:hover, .mtoc a:hover { color: var(--ink); }
.toc a.on, .mtoc a.on { padding-left: 16px; color: var(--ink); border-left-color: var(--signal); font-weight: 600; }
.cap { font: 600 0.875rem var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px 12px; }
.pct { margin: 12px 0 0 12px; font-size: 0.875rem; }
@media (min-width: 1180px) {
  .stage { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 40px; align-items: start; }
  .toc { display: block; position: sticky; top: 96px; padding-top: 32px; }
}
@media (max-width: 1179px) {
  .mtoc { display: block; position: sticky; top: 64px; z-index: 30; background: var(--bg); border-bottom: 1px solid var(--line); }
  .mtoc summary { cursor: pointer; padding: 12px 20px; font-weight: 600; font-size: .95rem; display: flex; gap: 10px; align-items: baseline; }
  .mtoc summary .muted { font-weight: 400; font-size: 0.875rem; }
  .mtoc ol { padding: 0 20px 12px; }
}
@media (max-width: 560px) { .pager { grid-template-columns: 1fr; } .next { text-align: left; } }
</style>
