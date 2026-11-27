<script setup lang="ts">
import { lessons } from '#content'
useSeoMeta({ title: 'Suggest a topic', description: 'Tell us which system design topic you want as the next free, interactive lab.' })
const covered = computed(() => lessons.slice(0, 8))
</script>

<template>
  <div class="wrap page">
    <header class="head">
      <p class="eyebrow">Suggest a topic</p>
      <h1>What should the next lab be?</h1>
      <p class="muted lede">Every lab is picked from real engineering problems. If there's a system, incident or trade-off you want to understand, tell us and it goes straight into the queue.</p>
    </header>

    <div class="grid">
      <section class="card form-card" aria-label="Suggestion form">
        <SuggestForm />
      </section>

      <aside class="side">
        <section aria-labelledby="good-h">
          <h2 id="good-h">Ideas that make great labs</h2>
          <ul class="tips">
            <li><strong>A real system.</strong> “How does Stripe stop double charges?” beats “payments”.</li>
            <li><strong>A failure you read about.</strong> Outage write-ups become the best simulators.</li>
            <li><strong>An interview question</strong> you couldn't answer the way you wanted.</li>
          </ul>
        </section>
        <section v-if="covered.length" aria-labelledby="cov-h">
          <h2 id="cov-h">Already covered</h2>
          <ul class="covered">
            <li v-for="l in covered" :key="l.slug"><NuxtLink :to="`/labs/${l.slug}`">{{ l.title }}</NuxtLink></li>
          </ul>
          <NuxtLink to="/labs" class="all">See all labs</NuxtLink>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page { padding-top: 56px; }
.head { display: grid; gap: 14px; max-width: 760px; }
.eyebrow { font: 500 0.875rem var(--f-mono); text-transform: uppercase; letter-spacing: .08em; color: var(--spark); }
.head h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
.lede { font-size: 1.12rem; max-width: 60ch; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 56px; align-items: start; margin-top: 40px; }
.card { background: var(--surface); border: 1.5px solid var(--line); border-radius: var(--r-lg); padding: clamp(20px, 3vw, 32px); min-width: 0; }
.side { display: grid; gap: 36px; position: sticky; top: 88px; }
.side section { display: grid; gap: 12px; }
.side h2 { font-size: 1.15rem; }
.tips { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.tips li { font-size: .95rem; color: var(--muted); padding-left: 18px; position: relative; }
.tips li::before { content: ""; position: absolute; left: 0; top: .6em; width: 7px; height: 7px; border-radius: 50%; background: var(--spark-fill); }
.tips strong { color: var(--ink); font-weight: 600; }
.covered { list-style: none; margin: 0; padding: 0; display: grid; }
.covered li { border-top: 1px solid var(--line); padding: 9px 0; font-size: .95rem; }
.covered a { color: var(--ink); text-decoration: none; }
.covered a:hover { color: var(--signal); }
.all { font-weight: 600; font-size: .92rem; }
@media (max-width: 860px) {
  .grid { grid-template-columns: 1fr; gap: 40px; }
  .side { position: static; }
}
</style>
