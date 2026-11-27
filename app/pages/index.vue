<script setup lang="ts">
import { lessons, articles } from '#content'
const latest = lessons[0]
const recent = lessons.slice(0, 7)
const topics = useTopics()
const { isDone } = useProgress()
useSeoMeta({ ogTitle: 'System Design Lab', ogDescription: 'Free, interactive system design labs built from real engineering incidents.' })

const parts = [
  { t: 'The incident', d: 'What broke, or what scale forced the design, with numbers from the original engineering write-up.' },
  { t: 'The concept', d: 'The mechanism, its trade-offs and how it fails, compared side by side with the naive approach.' },
  { t: 'The simulator', d: 'Sliders, toggles and live traffic. Push the system until the naive design falls over.' },
  { t: 'Solve it', d: 'A concrete design problem with hints and a model answer you reveal when you are ready.' },
  { t: 'Apply it', d: 'How the idea maps onto everyday tools: Laravel, Node.js, MongoDB, Kafka and AWS.' },
]
</script>

<template>
  <div>
    <section class="hero wrap">
      <div class="copy">
        <h1>System design, with the parts moving.</h1>
        <p class="lede">Free, interactive labs built from real outages and engineering write-ups. Change the traffic, kill a node, watch what breaks. A new lab lands most mornings.</p>
        <div class="ctas">
          <NuxtLink v-if="latest" :to="`/labs/${latest.slug}`" class="btn btn-primary">Open today's lab</NuxtLink>
          <NuxtLink to="/labs" class="btn">Browse all {{ lessons.length }} labs</NuxtLink>
        </div>
        <p class="free">No paywall, no account, no ads.</p>
      </div>
      <HeroLB />
    </section>

    <section v-if="latest" class="today wrap" aria-labelledby="today-h">
      <div class="today-card">
        <div class="today-meta">
          <span class="flag">Latest lab</span>
          <time :datetime="latest.date">{{ formatDate(latest.date, { weekday: 'long', day: 'numeric', month: 'long' }) }}</time>
        </div>
        <h2 id="today-h"><NuxtLink :to="`/labs/${latest.slug}`">{{ latest.headline }}</NuxtLink></h2>
        <p class="summary">{{ latest.summary }}</p>
        <div class="today-foot">
          <span class="topic" :style="{ '--dot': topicColor(latest.topic) }">{{ latest.topic }}</span>
          <span class="muted">{{ latest.minutes }} min with the simulator</span>
          <span class="muted">{{ latest.sources }} sources</span>
          <NuxtLink :to="`/labs/${latest.slug}`" class="btn btn-small btn-primary push">Start the lab</NuxtLink>
        </div>
      </div>
    </section>

    <section class="parts wrap" aria-labelledby="parts-h">
      <h2 id="parts-h">Every lab runs in the same order</h2>
      <ol>
        <li v-for="(p, i) in parts" :key="p.t">
          <span class="n">{{ i + 1 }}</span>
          <h3>{{ p.t }}</h3>
          <p class="muted">{{ p.d }}</p>
        </li>
      </ol>
    </section>

    <section v-if="recent.length" class="recent wrap" aria-labelledby="recent-h">
      <div class="list">
        <div class="list-head">
          <h2 id="recent-h">Latest labs</h2>
          <NuxtLink to="/labs">See all</NuxtLink>
        </div>
        <LabRow v-for="(l, i) in recent" :key="l.slug" :lab="l" :done="isDone(l.slug)" :latest="i === 0" />
      </div>
      <aside class="topics" aria-label="Topics">
        <h3>Topics so far</h3>
        <ul>
          <li v-for="t in topics" :key="t.name">
            <NuxtLink :to="{ path: '/labs', query: { topic: t.name } }" class="topic" :style="{ '--dot': t.color }">{{ t.name }}</NuxtLink>
            <span class="muted">{{ t.count }}</span>
          </li>
        </ul>
      </aside>
    </section>

    <section id="subscribe" class="sub" aria-labelledby="sub-h">
      <div class="wrap sub-in">
        <div>
          <h2 id="sub-h">Get tomorrow's lab in your inbox</h2>
          <p class="muted">One email when a new lab is published, with the incident it is built on and a link to the simulator.</p>
        </div>
        <NewsletterForm source="home" />
      </div>
    </section>

    <section v-if="articles.length" class="arts wrap" aria-labelledby="arts-h">
      <div class="list-head">
        <h2 id="arts-h">Articles</h2>
        <NuxtLink to="/articles">All articles</NuxtLink>
      </div>
      <div class="art-grid">
        <NuxtLink v-for="a in articles.slice(0, 3)" :key="a.slug" :to="`/articles/${a.slug}`" class="art">
          <h3>{{ a.title }}</h3>
          <p class="muted">{{ a.summary }}</p>
          <span class="muted small">{{ a.minutes }} min read</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 48px; align-items: center; padding-block: 64px 40px; }
.copy { display: grid; gap: 22px; }
.lede { font-size: 1.2rem; color: var(--muted); max-width: 46ch; }
.ctas { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.free { font-size: .92rem; color: var(--muted); }
@media (max-width: 900px) { .hero { grid-template-columns: 1fr; padding-top: 40px; } }

.today { margin-top: 24px; }
.today-card { background: var(--ink); color: var(--bg); border-radius: var(--r-lg); padding: clamp(24px, 4vw, 44px); display: grid; gap: 16px; }
.today-card a { color: inherit; text-decoration: none; }
.today-card a:hover { text-decoration: underline; text-decoration-thickness: 2px; }
.today-card h2 { font-size: clamp(1.7rem, 3.6vw, 2.7rem); max-width: 26ch; }
.today-meta { display: flex; gap: 14px; align-items: center; font-size: .92rem; opacity: .8; }
.flag { background: var(--spark-fill); color: #17181c; font-weight: 700; padding: 3px 10px; border-radius: 999px; font-size: 0.875rem; opacity: 1; }
.summary { font-size: 1.08rem; max-width: 66ch; opacity: .85; }
.today-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; font-size: .92rem; }
.today-foot .topic, .today-foot .muted { color: color-mix(in srgb, var(--bg) 70%, transparent); }
.today-foot .btn { background: var(--bg); color: var(--ink); border-color: var(--bg); }
.today-foot .btn:hover { background: var(--spark-fill); border-color: var(--spark-fill); color: #17181c; }
.push { margin-left: auto; }

.parts { margin-top: 96px; display: grid; gap: 28px; }
.parts ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; border-top: 2px solid var(--ink); }
.parts li { padding: 18px 20px 0 0; display: grid; gap: 8px; align-content: start; position: relative; }
.parts li + li { padding-left: 20px; border-left: 1px solid var(--line); }
.n { font-family: var(--f-display); font-weight: 800; font-size: 1rem; color: var(--signal); }
.parts li:nth-child(3) .n { color: var(--spark); }
.parts p { font-size: .95rem; }
@media (max-width: 900px) {
  .parts ol { grid-template-columns: 1fr; border-top: 0; }
  .parts li, .parts li + li { padding: 16px 0 16px 0; border-left: 0; border-top: 1px solid var(--line); grid-template-columns: 28px 1fr; }
  .parts li h3, .parts li p { grid-column: 2; }
  .parts li .n { grid-row: span 2; }
}

.recent { margin-top: 96px; display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 56px; }
.list-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
.topics h3 { font-size: 1rem; margin-bottom: 12px; }
.topics ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.topics li { display: flex; justify-content: space-between; }
.topics a { color: var(--ink); text-decoration: none; }
.topics a:hover { color: var(--signal); }
@media (max-width: 900px) { .recent { grid-template-columns: 1fr; gap: 32px; } }

.sub { margin-top: 96px; background: var(--signal-soft); padding-block: 56px; }
.sub-in { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: center; }
.sub-in > div { display: grid; gap: 10px; max-width: 46ch; }
@media (max-width: 860px) { .sub-in { grid-template-columns: 1fr; } }

.arts { margin-top: 96px; }
.art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0 32px; }
.art { display: grid; gap: 8px; padding: 20px 0; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.art:hover h3 { color: var(--signal); }
.small { font-size: 0.875rem; }
</style>
