<script setup lang="ts">
import { articles } from '#content'
useSeoMeta({ title: 'Articles', description: 'Longer reads on system design: study methods, case studies and the trade-offs behind the labs.' })
const featured = articles[0]
const rest = articles.slice(1)
</script>

<template>
  <div class="wrap page">
    <header class="head">
      <h1>Articles</h1>
      <p class="muted lede">Longer reads that sit next to the labs: case studies, trade-offs and the failure modes that don't fit in a simulator.</p>
    </header>

    <NuxtLink v-if="featured" :to="`/articles/${featured.slug}`" class="feature">
      <span class="tag">Featured · {{ featured.tag }}</span>
      <h2>{{ featured.title }}</h2>
      <p>{{ featured.summary }}</p>
      <span class="meta"><time :datetime="featured.date">{{ formatDate(featured.date) }}</time> · {{ featured.minutes }} min read</span>
    </NuxtLink>

    <ul class="list">
      <li v-for="a in rest" :key="a.slug">
        <NuxtLink :to="`/articles/${a.slug}`">
          <span class="tag">{{ a.tag }}</span>
          <h2>{{ a.title }}</h2>
          <p class="muted">{{ a.summary }}</p>
          <span class="muted small"><time :datetime="a.date">{{ formatDate(a.date) }}</time> · {{ a.minutes }} min read</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="!articles.length" class="muted">The first article is on its way. Until then, the <NuxtLink to="/labs">labs</NuxtLink> are all open.</p>
  </div>
</template>

<style scoped>
.page { padding-top: 56px; }
.head { display: grid; gap: 12px; margin-bottom: 32px; }
.head h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
.lede { font-size: 1.12rem; max-width: 56ch; }
.feature { display: grid; gap: 10px; max-width: 760px; padding: 28px; margin-bottom: 8px; border: 1.5px solid var(--line); border-radius: var(--r-lg); background: var(--surface); color: var(--ink); text-decoration: none; }
.feature:hover h2 { color: var(--signal); }
.feature h2 { font-size: clamp(1.6rem, 3vw, 2rem); }
.feature p { color: var(--muted); }
.feature .meta { color: var(--muted); font-size: .88rem; }
.tag { font: 600 0.875rem var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--signal); }
.list { list-style: none; padding: 0; margin: 0; max-width: 760px; }
.list a { display: grid; gap: 8px; padding: 24px 0; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.list a:hover h2 { color: var(--signal); }
.list h2 { font-size: 1.5rem; }
.small { font-size: .88rem; }
</style>
