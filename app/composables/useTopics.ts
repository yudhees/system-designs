import { lessons } from '#content'

// Stable colour per topic so a topic looks the same everywhere on the site.
const HUES = ['#4f46e5', '#c2570c', '#15803d', '#9333ea', '#c62828', '#0e8f8a', '#be3a8f', '#6b7d12']

export function topicColor(topic: string) {
  let h = 0
  for (const c of topic.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

export function useTopics() {
  const counts = new Map<string, number>()
  for (const l of lessons) counts.set(l.topic, (counts.get(l.topic) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count, color: topicColor(name) }))
}

export function formatDate(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
}
