<script setup lang="ts">
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
useHead({ link: [{ rel: 'preload', href: lab.file, as: 'document' }] })

// The lab is a complete page with its own styles and scripts, so it runs in an
// iframe (same origin). We size the frame to its content so the page scrolls
// as one, and pass the site theme through.
const frame = ref<HTMLIFrameElement>()
const height = ref(1400)
let ro: ResizeObserver | undefined
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
  const measure = () => { height.value = Math.max(600, doc.documentElement.scrollHeight) }
  measure()
  ro?.disconnect()
  ro = new ResizeObserver(measure)
  ro.observe(doc.body)
  // Links inside the lab open outside the frame.
  doc.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href')!.startsWith('#')) a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener') })
}
watch(theme, syncTheme)
onBeforeUnmount(() => ro?.disconnect())
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

    <iframe ref="frame" :src="lab.file" :title="`${lab.title} lab`" :style="{ height: `${height}px` }" class="frame" @load="onLoad" />

    <footer class="wrap end">
      <div class="done-row">
        <ClientOnly>
          <button type="button" :class="['btn', isDone(lab.slug) ? '' : 'btn-primary']" @click="toggle(lab.slug)">{{ isDone(lab.slug) ? '✓ Marked as done' : 'Mark this lab as done' }}</button>
        </ClientOnly>
        <a :href="lab.file" target="_blank" rel="noopener" class="muted">Open the lab on its own page</a>
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
.frame { display: block; width: 100%; border: 0; background: var(--bg); }
.end { display: grid; gap: 40px; margin-top: 24px; }
.done-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pg { display: grid; gap: 4px; padding: 18px 20px; border: 1.5px solid var(--line); border-radius: var(--r-md); text-decoration: none; color: var(--ink); }
.pg:hover { border-color: var(--ink); }
.pg b { font-family: var(--f-display); font-size: 1.15rem; }
.next { text-align: right; }
.sub { display: grid; gap: 14px; background: var(--signal-soft); border-radius: var(--r-lg); padding: 32px; }
.sub h2 { font-size: 1.5rem; }
@media (max-width: 560px) { .pager { grid-template-columns: 1fr; } .next { text-align: left; } }
</style>
