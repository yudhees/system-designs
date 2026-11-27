<script setup lang="ts">
const { author, site } = useAppConfig()
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
        <p class="role">{{ author.title }}<span class="sep" aria-hidden="true" />{{ author.focus }}</p>
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

        <section aria-labelledby="exp-h">
          <h2 id="exp-h">What I work on</h2>
          <dl class="exp">
            <div v-for="e in author.expertise" :key="e.title">
              <dt>{{ e.title }}</dt>
              <dd>{{ e.text }}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="stack-h">
          <h2 id="stack-h">Tools I use daily</h2>
          <ul class="stack">
            <li v-for="s in author.stack" :key="s">{{ s }}</li>
          </ul>
        </section>

        <section aria-labelledby="why-h">
          <h2 id="why-h">Why {{ site.name }} is free</h2>
          <p>Most good system design material sits behind a subscription. I think the fundamentals should be open to every engineer, so every lab on this site is free, with no account and no ads.</p>
          <p>Each lab starts from primary sources: engineering blogs, papers and official documentation from teams such as Cloudflare, Stripe, Discord and Meta. Every number in a lab comes from those sources, and each lab lists them at the end. The simulators are simplified models built to compare designs, not to benchmark them.</p>
        </section>
      </div>

      <aside class="card" aria-labelledby="contact-h">
        <h2 id="contact-h">Get in touch</h2>
        <p class="muted">For corrections, topic requests or collaboration, message me on LinkedIn.</p>
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
.sep { width: 5px; height: 5px; border-radius: 50%; background: var(--line); margin: 0 12px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.actions svg { width: 18px; height: 18px; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 64px; align-items: start; margin-top: 40px; }
.main { display: grid; gap: 44px; max-width: 66ch; }
.main section { display: grid; gap: 14px; }
.main h2 { font-size: 1.35rem; }
.main p { font-size: 1.04rem; }
.summary { font-family: var(--f-display); font-size: clamp(1.25rem, 2.2vw, 1.55rem) !important; font-weight: 600; line-height: 1.4; letter-spacing: -0.015em; }
.exp { margin: 0; display: grid; gap: 0; }
.exp div { display: grid; grid-template-columns: 200px 1fr; gap: 20px; padding: 16px 0; border-top: 1px solid var(--line); }
.exp dt { font-weight: 600; }
.exp dd { margin: 0; color: var(--muted); }
.stack { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.stack li { border: 1.5px solid var(--line); border-radius: 8px; padding: 6px 12px; font-weight: 500; font-size: .95rem; background: var(--surface); }
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
  .exp div { grid-template-columns: 1fr; gap: 4px; }
}
@media (max-width: 480px) { .avatar { width: 64px; height: 64px; font-size: 1.8rem; } }
</style>
