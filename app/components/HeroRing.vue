<script setup lang="ts">
/**
 * The hero: a small, honest consistent-hashing demo.
 * 24 keys sit on a hash ring. Add or remove a server and count how many keys
 * change owner, on the ring versus with `hash % N`.
 */
const KEYS = 24
const VNODES = 8
const MAX = 7
const MIN = 2
const COLORS = ['#3b6cf0', '#1f9d6b', '#e0701f', '#9a5de0', '#0f9a96', '#c79a14', '#d04a9e']

function h32(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}
// Sorted around the ring so alternate keys can sit on an inner or outer track and never overlap.
const keys = Array.from({ length: KEYS }, (_, i) => { const id = `key_${i + 1}`; return { id, pos: h32(id) } })
  .sort((a, b) => a.pos - b.pos)

const servers = ref<number[]>([1, 2, 3, 4])
let nextId = 5
const mode = ref<'ring' | 'mod'>('ring')
const moved = ref<Set<number>>(new Set())
const last = ref<{ ring: number, mod: number, action: string } | null>(null)
const name = (id: number) => String.fromCharCode(64 + id)

function ringPoints(ids: number[]) {
  const pts: { pos: number, id: number }[] = []
  for (const id of ids) for (let v = 0; v < VNODES; v++) pts.push({ pos: h32(`server-${id}#${v}`), id })
  return pts.sort((a, b) => a.pos - b.pos)
}
function owners(ids: number[], m: 'ring' | 'mod') {
  if (m === 'mod') return keys.map(k => ids[k.pos % ids.length])
  const pts = ringPoints(ids)
  return keys.map((k) => {
    let lo = 0, hi = pts.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].pos < k.pos) lo = mid + 1; else hi = mid }
    return pts[lo === pts.length ? 0 : lo].id
  })
}

const points = computed(() => ringPoints(servers.value))
const owner = computed(() => owners(servers.value, mode.value))
const color = (id: number) => COLORS[(id - 1) % COLORS.length]
const counts = computed(() => servers.value.map(id => ({ id, n: owner.value.filter(o => o === id).length })))

let clear: ReturnType<typeof setTimeout> | undefined
function change(next: number[], action: string) {
  const before = { ring: owners(servers.value, 'ring'), mod: owners(servers.value, 'mod') }
  const after = { ring: owners(next, 'ring'), mod: owners(next, 'mod') }
  const diff = (a: number[], b: number[]) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0)
  last.value = { ring: diff(before.ring, after.ring), mod: diff(before.mod, after.mod), action }
  const cur = after[mode.value], prev = before[mode.value]
  moved.value = new Set(cur.map((v, i) => (v !== prev[i] ? i : -1)).filter(i => i >= 0))
  servers.value = next
  clearTimeout(clear)
  clear = setTimeout(() => { moved.value = new Set() }, 2200)
}
const add = () => { if (servers.value.length < MAX) { const id = nextId++; change([...servers.value, id], `Server ${name(id)} joined`) } }
const remove = () => {
  if (servers.value.length <= MIN) return
  const i = Math.floor(servers.value.length / 2)
  const gone = servers.value[i]
  change(servers.value.filter((_, j) => j !== i), `Server ${name(gone)} left`)
}
const reset = () => { servers.value = [1, 2, 3, 4]; nextId = 5; moved.value = new Set(); last.value = null }

// geometry
const C = 200, R = 138
const ang = (pos: number) => (pos / 4294967296) * Math.PI * 2 - Math.PI / 2
const xy = (pos: number, r: number) => ({ x: C + Math.cos(ang(pos)) * r, y: C + Math.sin(ang(pos)) * r })
function arc(a: number, b: number, r: number) {
  let a0 = ang(a), a1 = ang(b)
  if (a1 <= a0) a1 += Math.PI * 2
  const p0 = { x: C + Math.cos(a0) * r, y: C + Math.sin(a0) * r }, p1 = { x: C + Math.cos(a1) * r, y: C + Math.sin(a1) * r }
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}
const arcs = computed(() => {
  const p = points.value
  return p.map((pt, i) => ({ d: arc(p[(i - 1 + p.length) % p.length].pos, pt.pos, R + 16), c: color(pt.id) }))
})
const keyDots = computed(() => keys.map((k, i) => ({ ...xy(k.pos, R - 12 - (i % 2) * 30), c: color(owner.value[i]), moved: moved.value.has(i) })))

const pct = (n: number) => `${Math.round((n / KEYS) * 100)}%`
const modeLabel = computed(() => (mode.value === 'ring' ? 'consistent hashing' : 'plain hash % N'))
onBeforeUnmount(() => clearTimeout(clear))
</script>

<template>
  <figure class="ring" aria-labelledby="ring-cap">
    <div class="stage">
      <svg viewBox="0 0 400 400" role="img" aria-label="A hash ring. Each dot is a cached key, coloured by the server that owns it.">
        <circle :cx="C" :cy="C" :r="R + 16" class="track" />
        <path v-for="(a, i) in arcs" :key="i" :d="a.d" :stroke="a.c" class="own" />
        <g v-for="(k, i) in keyDots" :key="i">
          <circle v-if="k.moved" :cx="k.x" :cy="k.y" r="9" :stroke="k.c" class="pulse" />
          <circle :cx="k.x" :cy="k.y" r="8" :fill="k.c" :class="['key', { moved: k.moved }]" />
        </g>
        <circle :cx="C" :cy="C" r="52" class="hub" />
        <text :x="C" :y="C + 4" class="hub-n">{{ servers.length }}</text>
        <text :x="C" :y="C + 28" class="hub-l">servers</text>
      </svg>
    </div>

    <ul class="legend" aria-label="Servers and how many keys each holds">
      <li v-for="c in counts" :key="c.id"><i :style="{ background: color(c.id) }" /><b>{{ name(c.id) }}</b><span>{{ c.n }} {{ c.n === 1 ? 'key' : 'keys' }}</span></li>
    </ul>

    <div class="panel">
      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="servers.length >= MAX" @click="add">+ Add a server</button>
        <button type="button" class="btn" :disabled="servers.length <= MIN" @click="remove">− Remove one</button>
        <button v-if="last" type="button" class="reset" @click="reset">Reset</button>
      </div>

      <div id="ring-cap" class="result" aria-live="polite">
        <template v-if="last">
          <p class="what">{{ last.action }}. How many of the {{ KEYS }} keys had to move?</p>
          <div class="bar"><span class="lbl">Consistent hashing</span><span class="track-b"><span class="fill good" :style="{ width: pct(last.ring) }" /></span><b>{{ last.ring }}</b></div>
          <div class="bar"><span class="lbl">Plain hash % N</span><span class="track-b"><span class="fill bad" :style="{ width: pct(last.mod) }" /></span><b>{{ last.mod }}</b></div>
          <p class="note">Every moved key is a cache miss. Fewer moves means a calmer database.</p>
        </template>
        <p v-else class="what">Add a server and see how many cached keys lose their home.</p>
      </div>

      <div class="seg" role="group" aria-label="Which strategy the ring shows">
        <button type="button" :aria-pressed="mode === 'ring'" @click="mode = 'ring'">Show consistent hashing</button>
        <button type="button" :aria-pressed="mode === 'mod'" @click="mode = 'mod'">Show hash % N</button>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.ring { margin: 0; display: grid; gap: 16px; }
.stage { aspect-ratio: 1; width: 100%; max-width: 420px; margin-inline: auto; }
svg { width: 100%; height: 100%; display: block; overflow: visible; }
.track { fill: none; stroke: var(--line); stroke-width: 1.5; }
.own { fill: none; stroke-width: 12; stroke-linecap: butt; transition: stroke .4s; }
.key { transition: fill .5s; stroke: var(--bg); stroke-width: 2.5; }
.key.moved { stroke: var(--ink); stroke-width: 3; }
.pulse { fill: none; stroke-width: 3; transform-box: fill-box; transform-origin: center; animation: pulse 1.1s ease-out 2; }
@keyframes pulse { from { transform: scale(1); opacity: .9; } to { transform: scale(2.6); opacity: 0; } }
.hub { fill: var(--surface); stroke: var(--line); }
.hub-n { text-anchor: middle; font: 800 44px var(--f-display); fill: var(--ink); }
.hub-l { text-anchor: middle; font: 500 16px var(--f-body); fill: var(--muted); }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 10px; justify-content: center; }
.legend li { display: inline-flex; align-items: center; gap: 8px; font-size: 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px 6px 10px; }
.legend i { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
.legend span { color: var(--muted); }
.panel { display: grid; gap: 16px; justify-items: center; text-align: center; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; align-items: center; }
.reset { background: none; border: 0; color: var(--muted); font: 600 1rem var(--f-body); text-decoration: underline; cursor: pointer; padding: 8px; }
.result { display: grid; gap: 10px; width: 100%; max-width: 440px; min-height: 8.5em; align-content: start; }
.what { font-size: 1.1rem; font-weight: 600; color: var(--ink); margin: 0; }
.bar { display: grid; grid-template-columns: 10.5em 1fr 2.2em; align-items: center; gap: 10px; text-align: left; font-size: 1rem; }
.bar .lbl { color: var(--muted); }
.bar b { font: 800 1.3rem var(--f-display); color: var(--ink); text-align: right; }
.track-b { display: block; height: 14px; border-radius: 999px; background: var(--sunk); overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 999px; transition: width .6s cubic-bezier(.4, 0, .2, 1); min-width: 4px; }
.fill.good { background: var(--ok); }
.fill.bad { background: var(--bad); }
.note { color: var(--muted); font-size: 1rem; margin: 0; }
.seg { display: inline-flex; flex-wrap: wrap; justify-content: center; background: var(--sunk); padding: 3px; border-radius: 999px; }
.seg button { font: 600 1rem var(--f-body); border: 0; background: none; color: var(--muted); padding: 8px 16px; border-radius: 999px; cursor: pointer; }
.seg button[aria-pressed=true] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(20, 35, 59, .12); }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; opacity: 0; } .fill, .key, .own { transition: none; } }
@media (max-width: 480px) { .bar { grid-template-columns: 8.5em 1fr 2em; font-size: .95rem; } }
</style>
