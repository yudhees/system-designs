// Everything personal on the site lives here, so it's one place to edit.
export default defineAppConfig({
  site: {
    name: 'System Design Lab',
    tagline: 'Free, interactive system design.',
  },
  author: {
    name: 'Yudhees',
    role: 'Full-stack engineer',
    // Leave a field empty to hide it on the About page.
    linkedin: 'https://www.linkedin.com/in/yudhees',
    email: '',
    github: 'https://github.com/yudhees',
    x: '',
    website: '',
    bio: [
      'I build backend systems for hotel search and booking: supplier fan-out, price caching, webhooks and the queues between them, mostly on Laravel, Node.js, MongoDB, Kafka and AWS.',
      'Good system design material is mostly locked behind subscriptions. This site is my answer: every lab is free, starts from a real incident or engineering write-up, and lets you push the system until it breaks.',
    ],
  },
})
