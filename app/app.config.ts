// Everything personal on the site lives here, so it's one place to edit.
export default defineAppConfig({
  site: {
    name: 'System Design Lab',
    tagline: 'Free, interactive system design.',
  },
  author: {
    name: 'Yudhees',
    title: 'Backend Engineer',
    focus: 'Travel search and booking platforms',
    // Leave a field empty to hide it on the About page.
    linkedin: 'https://www.linkedin.com/in/yudhees',
    email: '',
    github: 'https://github.com/yudhees',
    x: '',
    website: '',
    summary: 'I design and build the backend systems behind hotel search and booking: integrations that fan out to many suppliers at once, price and availability caches that stay fast under load, and the event pipelines and webhooks that keep bookings consistent end to end.',
    expertise: [
      { title: 'Supplier integration', text: 'Parallel fan-out to third-party inventory APIs, with timeouts, rate limits and graceful degradation when a supplier is slow or down.' },
      { title: 'Caching at scale', text: 'Price and availability caching tuned for freshness, hit rate and protection of upstream quotas.' },
      { title: 'Event-driven systems', text: 'Queues, Kafka streams and webhook delivery built for retries, ordering and idempotent processing.' },
    ],
    stack: ['PHP', 'Laravel', 'Node.js', 'Vue.js', 'MongoDB', 'Kafka', 'AWS'],
  },
})
