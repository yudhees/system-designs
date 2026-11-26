<script setup lang="ts">
const { author, site } = useAppConfig()
useSeoMeta({ title: 'About', description: `Who makes ${site.name}, why it's free, and how to get in touch.` })

const contacts = computed(() => [
  author.linkedin && { label: 'LinkedIn', href: author.linkedin, text: author.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') },
  author.email && { label: 'Email', href: `mailto:${author.email}`, text: author.email },
  author.github && { label: 'GitHub', href: author.github, text: author.github.replace(/^https?:\/\/(www\.)?/, '') },
  author.x && { label: 'X', href: author.x, text: author.x.replace(/^https?:\/\/(www\.)?/, '') },
  author.website && { label: 'Website', href: author.website, text: author.website.replace(/^https?:\/\//, '') },
].filter(Boolean) as { label: string, href: string, text: string }[])
</script>

<template>
  <div class="wrap page">
    <div class="grid">
      <div class="main">
        <h1>About</h1>
        <p class="intro">Hi, I'm {{ author.name }}, a {{ author.role.toLowerCase() }}.</p>
        <p v-for="(p, i) in author.bio" :key="i">{{ p }}</p>

        <h2>How the labs are made</h2>
        <p>Each lab starts from primary sources: engineering blogs, papers and official docs from teams like Cloudflare, Stripe, Discord and Meta. The numbers in a lab come from those sources, and every lab lists them at the end. The simulators are simplified models, built to show how a design behaves relative to the naive one, not to benchmark it.</p>
        <p>Spotted a mistake, or want a topic covered? Get in touch below.</p>
      </div>

      <aside class="card" aria-labelledby="contact-h">
        <h2 id="contact-h">Contact</h2>
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
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 64px; align-items: start; }
.main { display: grid; gap: 18px; max-width: 64ch; font-size: 1.06rem; }
.main h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); margin-bottom: 8px; }
.main h2 { font-size: 1.5rem; margin-top: 24px; }
.intro { font-family: var(--f-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
.card { position: sticky; top: 88px; background: var(--surface); border: 1.5px solid var(--line); border-radius: var(--r-lg); padding: 24px; display: grid; gap: 18px; }
.card h2 { font-size: 1.25rem; }
.card ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.card li { display: grid; gap: 2px; font-size: .95rem; }
.card li .muted { font-size: .82rem; }
.card a { word-break: break-word; }
.sub { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 18px; }
.sub h3 { font-size: 1rem; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; gap: 32px; } .card { position: static; } }
</style>
