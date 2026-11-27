<script setup lang="ts">
const { author } = useAppConfig()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="ftr">
    <div class="wrap cols">
      <div class="about">
        <NuxtLink to="/" class="brand"><BrandMark /> System Design Lab</NuxtLink>
        <p class="muted">Free, interactive system design labs. No paywall, no account, no ads.</p>
      </div>
      <nav aria-label="Footer">
        <NuxtLink to="/labs">All labs</NuxtLink>
        <NuxtLink to="/articles">Articles</NuxtLink>
        <NuxtLink to="/suggest">Suggest a topic</NuxtLink>
        <NuxtLink to="/about">About</NuxtLink>
        <a href="/rss.xml">RSS feed</a>
        <a v-if="author.linkedin" :href="author.linkedin" rel="me noopener" target="_blank">LinkedIn</a>
        <a v-if="author.github" :href="author.github" rel="me noopener" target="_blank">GitHub</a>
      </nav>
    </div>
    <div class="wrap legal muted">Made by {{ author.name }}, {{ year }}. Lab sources are cited inside each lab.</div>
  </footer>
</template>

<style scoped>
.ftr { border-top: 1px solid var(--line); margin-top: 96px; padding-block: 40px 28px; font-size: .95rem; }
.cols { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 24px 48px; }
.about { display: grid; gap: 10px; max-width: 40ch; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-family: var(--f-display); font-weight: 800; }
nav { display: flex; flex-wrap: wrap; gap: 8px 22px; align-content: start; }
nav a { color: var(--ink); text-decoration: none; }
nav a:hover { color: var(--signal); }
.legal { margin-top: 28px; font-size: .85rem; }
</style>
