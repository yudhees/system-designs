<script setup lang="ts">
import { lessons } from '#content'
useSeoMeta({ title: 'All labs', description: 'Every System Design Lab, newest first: caching, partitioning, rate limiting and more, each with a live simulator.' })

const route = useRoute()
const router = useRouter()
const topics = useTopics()
const { isDone, done } = useProgress()
const q = ref('')
const topic = computed(() => (typeof route.query.topic === 'string' ? route.query.topic : ''))
const setTopic = (t: string) => router.replace({ query: t ? { topic: t } : {} })

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return lessons.filter(l =>
    (!topic.value || l.topic === topic.value)
    && (!needle || `${l.title} ${l.headline} ${l.summary} ${l.topic}`.toLowerCase().includes(needle)))
})
const doneCount = computed(() => lessons.filter(l => done.value.includes(l.slug)).length)
</script>

<template>
  <div class="wrap page">
    <header class="head">
      <h1>All labs</h1>
      <p class="muted lede">Each lab starts from a real system at scale and ends with a design problem for you to solve. Newest first.</p>
      <ClientOnly><p v-if="doneCount" class="progress">You have finished {{ doneCount }} of {{ lessons.length }}.</p></ClientOnly>
    </header>

    <div class="layout">
      <aside class="side" aria-label="Filter labs">
        <label class="search">
          <span class="visually-hidden">Search labs</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input v-model="q" type="search" placeholder="Search labs">
        </label>
        <h2 class="side-h">Topics</h2>
        <ul>
          <li><button type="button" :aria-pressed="!topic" @click="setTopic('')"><span>All topics</span><span class="muted">{{ lessons.length }}</span></button></li>
          <li v-for="t in topics" :key="t.name">
            <button type="button" :aria-pressed="topic === t.name" @click="setTopic(t.name)">
              <span class="topic" :style="{ '--dot': t.color }">{{ t.name }}</span><span class="muted">{{ t.count }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <section aria-live="polite">
        <LabRow v-for="l in shown" :key="l.slug" :lab="l" :done="isDone(l.slug)" />
        <div v-if="!shown.length" class="empty">
          <p>No labs match “{{ q }}”{{ topic ? ` in ${topic}` : '' }}.</p>
          <button type="button" class="btn btn-small" @click="q = ''; setTopic('')">Clear filters</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page { padding-top: 56px; }
.head { display: grid; gap: 12px; margin-bottom: 40px; }
.head h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
.lede { font-size: 1.12rem; max-width: 56ch; }
.progress { color: var(--ok); font-weight: 600; }
.layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 56px; align-items: start; }
.side { position: sticky; top: 88px; display: grid; gap: 14px; }
.side-h { font-size: .95rem; margin-top: 8px; }
.side ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 2px; }
.side button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; font: inherit; font-size: .95rem; background: none; border: 0; color: var(--ink); padding: 8px 10px; border-radius: 8px; cursor: pointer; text-align: left; }
.side button:hover { background: var(--sunk); }
.side button[aria-pressed=true] { background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--ink); }
.side .topic { color: var(--ink); font-size: .95rem; }
.search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 999px; padding: 0 14px; }
.search:focus-within { border-color: var(--signal); }
.search svg { width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; flex: none; }
.search input { border: 0; background: none; font: inherit; color: var(--ink); padding: 10px 0; width: 100%; outline: none; }
.empty { border-top: 1px solid var(--line); padding: 32px 0; display: grid; gap: 14px; justify-items: start; }
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; gap: 24px; }
  .side { position: static; }
  .side ul { display: flex; flex-wrap: wrap; gap: 6px; }
  .side li button { width: auto; border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 12px; gap: 10px; }
  .side-h { display: none; }
}
</style>
