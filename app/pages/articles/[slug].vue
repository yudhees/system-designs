<script setup lang="ts">
import { articles } from '#content'
const route = useRoute()
const a = articles.find(x => x.slug === route.params.slug)
if (!a) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
useSeoMeta({ title: a.title, description: a.summary, ogTitle: a.title, ogDescription: a.summary, ogType: 'article' })
</script>

<template>
  <article class="wrap page">
    <nav class="crumbs" aria-label="Breadcrumb"><NuxtLink to="/articles">Articles</NuxtLink></nav>
    <header class="head">
      <p class="tag">{{ a!.tag }}</p>
      <h1>{{ a!.title }}</h1>
      <p class="muted"><time :datetime="a!.date">{{ formatDate(a!.date, { day: 'numeric', month: 'long', year: 'numeric' }) }}</time>, {{ a!.minutes }} min read</p>
    </header>
    <!-- Article HTML is generated at build time from Markdown files in this repo. -->
    <div class="prose" v-html="a!.html" />
    <section class="sub" aria-labelledby="art-sub">
      <h2 id="art-sub">Get new labs and articles by email</h2>
      <NewsletterForm :source="`article-${a!.slug}`" />
    </section>
  </article>
</template>

<style scoped>
.page { padding-top: 40px; }
.crumbs a { color: var(--muted); text-decoration: none; font-size: .92rem; }
.head { display: grid; gap: 14px; margin: 16px 0 36px; max-width: 30ch; }
.head h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
.head p { font-size: .95rem; }
.tag { font: 600 0.875rem var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--signal); }
.sub { margin-top: 64px; max-width: 68ch; display: grid; gap: 14px; border-top: 2px solid var(--ink); padding-top: 24px; }
.sub h2 { font-size: 1.4rem; }
</style>
