<script setup lang="ts">
import { articles } from '#content'
useSeoMeta({ title: 'Articles', description: 'Longer reads on system design: study methods, case studies and the trade-offs behind the labs.' })
</script>

<template>
  <div class="wrap page">
    <header class="head">
      <h1>Articles</h1>
      <p class="muted lede">Longer reads that sit next to the labs: how to study, case studies, and the trade-offs that don't fit in a simulator.</p>
    </header>
    <ul class="list">
      <li v-for="a in articles" :key="a.slug">
        <NuxtLink :to="`/articles/${a.slug}`">
          <h2>{{ a.title }}</h2>
          <p class="muted">{{ a.summary }}</p>
          <span class="muted small"><time :datetime="a.date">{{ formatDate(a.date) }}</time>, {{ a.minutes }} min read</span>
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
.list { list-style: none; padding: 0; margin: 0; max-width: 760px; }
.list a { display: grid; gap: 8px; padding: 24px 0; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.list a:hover h2 { color: var(--signal); }
.list h2 { font-size: 1.5rem; }
.small { font-size: .88rem; }
</style>
