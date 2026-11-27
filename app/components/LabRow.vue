<script setup lang="ts">
import type { LessonMeta } from '#content'
const props = defineProps<{ lab: LessonMeta, done?: boolean, latest?: boolean }>()
const color = computed(() => topicColor(props.lab.topic))
</script>

<template>
  <article class="lab">
    <time :datetime="lab.date" class="date">
      <span class="d">{{ formatDate(lab.date, { day: 'numeric' }) }}</span>
      <span class="m">{{ formatDate(lab.date, { month: 'short', year: 'numeric' }) }}</span>
    </time>
    <div class="body">
      <h3><NuxtLink :to="`/labs/${lab.slug}`" class="stretch">{{ lab.title }}</NuxtLink></h3>
      <p class="headline">{{ lab.headline }}</p>
      <div class="meta">
        <span class="topic" :style="{ '--dot': color }">{{ lab.topic }}</span>
        <span class="muted">{{ lab.minutes }} min</span>
        <span v-if="latest" class="new">Newest</span>
        <span v-if="done" class="done">Done</span>
      </div>
    </div>
    <svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  </article>
</template>

<style scoped>
.lab { position: relative; display: grid; grid-template-columns: 64px 1fr 28px; gap: 20px; align-items: start; padding: 22px 0; border-top: 1px solid var(--line); }
.lab:hover h3 a { color: var(--signal); }
.lab:hover .go { transform: translateX(4px); color: var(--signal); }
.date { display: grid; line-height: 1.1; padding-top: 2px; }
.d { font-family: var(--f-display); font-weight: 800; font-size: 1.9rem; letter-spacing: -0.03em; }
.m { font-size: 0.875rem; color: var(--muted); }
.body { display: grid; gap: 6px; min-width: 0; }
h3 { font-size: 1.3rem; }
h3 a { color: var(--ink); text-decoration: none; }
.stretch::after { content: ""; position: absolute; inset: 0; }
.headline { color: var(--muted); max-width: 60ch; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.875rem; margin-top: 2px; }
.done { color: var(--ok); font-weight: 600; }
.done::before { content: "✓ "; }
.go { width: 22px; height: 22px; margin-top: 8px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; color: var(--muted); transition: transform .15s, color .15s; }
@media (max-width: 560px) { .lab { grid-template-columns: 48px 1fr; gap: 14px; } .go { display: none; } .d { font-size: 1.5rem; } }
.new { font: 700 .875rem var(--f-body); color: var(--signal); background: var(--signal-soft); border-radius: 999px; padding: 2px 10px; }
</style>
