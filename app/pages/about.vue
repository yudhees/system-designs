<script setup lang="ts">
import { lessons } from '#content'
const { author, site } = useAppConfig()
const path = [...lessons].reverse()
useSeoMeta({ title: 'About', description: `${author.name}, ${author.title}. ${author.summary}` })

const strip = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
const contacts = computed(() => [
  author.email && { label: 'Email', href: `mailto:${author.email}`, text: author.email },
  author.github && { label: 'GitHub', href: author.github, text: strip(author.github) },
  author.x && { label: 'X', href: author.x, text: strip(author.x) },
  author.website && { label: 'Website', href: author.website, text: strip(author.website) },
].filter(Boolean) as { label: string, href: string, text: string }[])
const initials = author.name.slice(0, 1).toUpperCase()
</script>

<template>
  <div class="wrap page">
    <section class="profile" aria-labelledby="about-h">
      <div class="avatar" aria-hidden="true">{{ initials }}</div>
      <div class="who">
        <h1 id="about-h">{{ author.name }}</h1>
        <p class="role">{{ author.title }}</p>
      </div>
      <div class="actions">
        <a v-if="author.linkedin" :href="author.linkedin" class="btn btn-primary" target="_blank" rel="me noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.5h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-4z" fill="currentColor" /></svg>
          Connect on LinkedIn
        </a>
        <a v-if="author.email" :href="`mailto:${author.email}`" class="btn">Email me</a>
      </div>
    </section>

    <div class="grid">
      <div class="main">
        <p class="summary">{{ author.summary }}</p>

        <section aria-labelledby="how-h">
          <h2 id="how-h">How the labs work</h2>
          <ol class="how">
            <li><span><b>A real incident.</b> Each lab opens with a system at scale and the numbers that forced a change.</span></li>
            <li><span><b>The concept.</b> The design that fixed it, its trade-offs and how it fails.</span></li>
            <li><span><b>A live simulator.</b> Push the naive design until it breaks, then compare the better one.</span></li>
            <li><span><b>Solve it.</b> A practical design problem with hints and a model answer.</span></li>
          </ol>
        </section>

        <section aria-labelledby="path-h">
          <h2 id="path-h">A path through the labs</h2>
          <p>New here? Start at the top and work down. The list grows every morning.</p>
          <ol class="path">
            <li v-for="l in path" :key="l.slug">
              <NuxtLink :to="`/labs/${l.slug}`">{{ l.headline }}</NuxtLink>
              <span class="topic"><i :style="{ background: topicColor(l.topic) }" />{{ l.topic }}</span>
            </li>
          </ol>
        </section>

        <section aria-labelledby="ask-h">
          <h2 id="ask-h">Five questions behind every lab</h2>
          <ul class="ask">
            <li>What happens when this is ten times busier?</li>
            <li>What happens when one part is slow, not dead?</li>
            <li>What does a retry do to the system?</li>
            <li>Which guarantee are we giving up, and on purpose?</li>
            <li>How would we notice it is failing?</li>
          </ul>
          <p>Keep these in your pocket. They turn most system design questions, in a design review or an interview, into something you can reason through.</p>
        </section>

        <section aria-labelledby="why-h">
          <h2 id="why-h">Why {{ site.name }} is free</h2>
          <p>Most good system design material sits behind a subscription. I think the fundamentals should be open to every engineer, so every lab on this site is free, with no account and no ads.</p>
          <p>Each lab starts from primary sources: engineering blogs, papers and official documentation from teams such as Cloudflare, Stripe, Discord and Meta. Every number in a lab comes from those sources, and each lab lists them at the end. The simulators are simplified models built to compare designs, not to benchmark them.</p>
        </section>
      </div>

      <aside class="card" aria-labelledby="contact-h">
        <h2 id="contact-h">Get in touch</h2>
        <p class="muted">Want a lab on something specific? <NuxtLink to="/suggest">Suggest a topic</NuxtLink>. For corrections or collaboration, message me on LinkedIn.</p>
        <a v-if="author.linkedin" :href="author.linkedin" class="li" target="_blank" rel="me noopener">{{ strip(author.linkedin) }}</a>
        <ul v-if="contacts.length">
          <li v-for="c in contacts" :key="c.label">
            <span class="muted">{{ c.label }}</span>
            <a :href="c.href" :rel="c.label === 'Email' ? undefined : 'me noopener'" :target="c.label === 'Email' ? undefined : '_blank'">{{ c.text }}</a>
          </li>
        </ul>
        <div class="sub">
          <h3>Newsletter</h3>
          <NewsletterForm compact source="about" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page { padding-top: 56px; }
.profile { display: grid; grid-template-columns: auto 1fr auto; gap: 24px; align-items: center; padding-bottom: 36px; border-bottom: 1px solid var(--line); }
.avatar { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; background: var(--ink); color: var(--bg); font: 800 2.4rem var(--f-display); letter-spacing: -0.03em; box-shadow: inset 0 0 0 4px var(--bg), 0 0 0 2px var(--ink); }
.who { display: grid; gap: 6px; }
.who h1 { font-size: clamp(2.2rem, 5vw, 3.2rem); }
.role { font-size: 1.12rem; color: var(--muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.actions svg { width: 18px; height: 18px; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 64px; align-items: start; margin-top: 40px; }
.main { display: grid; gap: 44px; max-width: 66ch; }
.main section { display: grid; gap: 14px; }
.main h2 { font-size: 1.35rem; }
.main p { font-size: 1.04rem; }
.summary { font-family: var(--f-display); font-size: clamp(1.25rem, 2.2vw, 1.55rem) !important; font-weight: 600; line-height: 1.4; letter-spacing: -0.015em; }
.how { margin: 0; padding: 0; list-style: none; counter-reset: how; display: grid; }
.how li { counter-increment: how; display: grid; grid-template-columns: 32px 1fr; gap: 8px; padding: 14px 0; border-top: 1px solid var(--line); color: var(--muted); }
.how li::before { content: counter(how); font-family: var(--f-display); font-weight: 800; color: var(--signal); }
.how b { color: var(--ink); font-weight: 600; }
.path { margin: 0; padding: 0; list-style: none; counter-reset: path; display: grid; }
.path li { counter-increment: path; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 12px 0 12px 40px; border-top: 1px solid var(--line); position: relative; }
.path li::before { content: counter(path); position: absolute; left: 0; font-family: var(--f-display); font-weight: 800; color: var(--signal); }
.path a { font-weight: 600; }
.path .topic { color: var(--muted); font-size: .85rem; display: inline-flex; align-items: center; gap: 6px; }
.path .topic i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ask { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.ask li { border-left: 3px solid var(--signal); padding: 8px 14px; background: var(--surface); border-radius: 0 8px 8px 0; font-weight: 500; }
.card { position: sticky; top: 88px; min-width: 0; background: var(--surface); border: 1.5px solid var(--line); border-radius: var(--r-lg); padding: 24px; display: grid; gap: 14px; }
.card h2 { font-size: 1.2rem; }
.card p { font-size: .95rem; }
.li { font-weight: 600; word-break: break-word; }
.card ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.card li { display: grid; gap: 2px; font-size: .95rem; }
.card li .muted { font-size: .82rem; }
.sub { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; margin-top: 4px; }
.sub h3 { font-size: 1rem; }
@media (max-width: 860px) {
  .profile { grid-template-columns: auto 1fr; }
  .actions { grid-column: 1 / -1; }
  .grid { grid-template-columns: 1fr; gap: 40px; }
  .card { position: static; }
}
@media (max-width: 480px) { .avatar { width: 64px; height: 64px; font-size: 1.8rem; } }
</style>
