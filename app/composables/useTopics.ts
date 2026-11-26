import { lessons } from '#content'

// Stable colour per topic so a topic looks the same everywhere on the site.
const HUES = ['#2f57d0', '#c9761a', '#1f8a5b', '#8a4fd1', '#c0392b', '#0f8a86', '#a0368f', '#5c6f1a']

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
