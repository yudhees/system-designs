<script setup lang="ts">
/**
 * The hero: a small, honest consistent-hashing demo.
 * 64 keys sit on a hash ring. Add or remove a server and count how many keys
 * change owner, on the ring versus with `hash % N`.
 */
const KEYS = 64
const VNODES = 10
const MAX = 8
const MIN = 2
const COLORS = ['#2f57d0', '#1f8a5b', '#8a4fd1', '#0f8a86', '#a0368f', '#5c6f1a', '#3b7dd8', '#7a5c2e']

function h32(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}
const keys = Array.from({ length: KEYS }, (_, i) => { const id = `hotel_${i + 1}`; return { id, pos: h32(id) } })

const servers = ref<number[]>([1, 2, 3, 4])
let nextId = 5
const mode = ref<'ring' | 'mod'>('ring')
const moved = ref<Set<number>>(new Set())
const last = ref<{ ring: number, mod: number, action: string } | null>(null)

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
  clear = setTimeout(() => { moved.value = new Set() }, 1600)
}
const add = () => { if (servers.value.length < MAX) change([...servers.value, nextId++], 'Added a server') }
const remove = () => {
  if (servers.value.length <= MIN) return
  const i = Math.floor(servers.value.length / 2)
  change(servers.value.filter((_, j) => j !== i), 'Removed a server')
}

// geometry
const C = 200, R = 150
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
  return p.map((pt, i) => ({ d: arc(p[(i - 1 + p.length) % p.length].pos, pt.pos, R + 12), c: color(pt.id) }))
})
const keyDots = computed(() => keys.map((k, i) => ({ ...xy(k.pos, R - 16 - (i % 3) * 11), c: color(owner.value[i]), moved: moved.value.has(i) })))

// One request at a time travels from the client (centre) to its key: the only ambient motion on the page.
const req = ref<{ x: number, y: number, n: number } | null>(null)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let n = 0
  timer = setInterval(() => { const k = keys[(n * 37) % KEYS]; req.value = { ...xy(k.pos, R - 16 - (((n * 37) % KEYS) % 3) * 11), n: n++ } }, 1100)
})
onBeforeUnmount(() => { clearInterval(timer); clearTimeout(clear) })

const pct = (n: number) => `${Math.round((n / KEYS) * 100)}%`
</script>

<template>
  <figure class="ring" aria-labelledby="ring-cap">
    <div class="stage">
      <svg viewBox="0 0 400 400" role="img" aria-label="A hash ring with servers and keys. Keys are coloured by the server that owns them.">
        <circle :cx="C" :cy="C" :r="R" class="track" />
        <path v-for="(a, i) in arcs" :key="i" :d="a.d" :stroke="a.c" class="own" />
        <circle v-for="(k, i) in keyDots" :key="i" :cx="k.x" :cy="k.y" :r="k.moved ? 6 : 4" :fill="k.c" :class="['key', { moved: k.moved }]" />
        <g v-if="req" :key="req.n" class="req" :style="{ '--tx': `${req.x - C}px`, '--ty': `${req.y - C}px` }">
          <circle :cx="C" :cy="C" r="4.5" />
        </g>
        <circle :cx="C" :cy="C" r="38" class="hub" />
        <text :x="C" :y="C - 3" class="hub-n">{{ servers.length }}</text>
        <text :x="C" :y="C + 15" class="hub-l">servers</text>
      </svg>
    </div>

    <div class="panel">
      <div class="seg" role="group" aria-label="How keys are assigned">
        <button type="button" :aria-pressed="mode === 'ring'" @click="mode = 'ring'">Hash ring</button>
        <button type="button" :aria-pressed="mode === 'mod'" @click="mode = 'mod'">hash % N</button>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-small btn-primary" :disabled="servers.length >= MAX" @click="add">Add a server</button>
        <button type="button" class="btn btn-small" :disabled="servers.length <= MIN" @click="remove">Remove one</button>
      </div>
      <p id="ring-cap" class="readout" aria-live="polite">
        <template v-if="last">
          {{ last.action }}. On the ring, <b>{{ last.ring }} of {{ KEYS }}</b> keys moved ({{ pct(last.ring) }}).
          With <code>% N</code>, <b class="bad">{{ last.mod }}</b> moved ({{ pct(last.mod) }}).
        </template>
        <template v-else>Add a server and count how many cached keys lose their home.</template>
      </p>
    </div>
  </figure>
</template>

<style scoped>
.ring { margin: 0; display: grid; gap: 14px; }
.stage { aspect-ratio: 1; width: 100%; max-width: 440px; margin-inline: auto; }
svg { width: 100%; height: 100%; display: block; overflow: visible; }
.track { fill: none; stroke: var(--line); stroke-width: 2; }
.own { fill: none; stroke-width: 10; stroke-linecap: butt; transition: stroke .3s; }
.key { transition: fill .35s, r .25s; }
.key.moved { stroke: var(--spark-fill); stroke-width: 3; }
.hub { fill: var(--surface); stroke: var(--line); }
.hub-n { text-anchor: middle; font: 800 26px var(--f-display); fill: var(--ink); }
.hub-l { text-anchor: middle; font: 500 11px var(--f-body); fill: var(--muted); }
.req circle { fill: var(--spark-fill); animation: travel 1s cubic-bezier(.4, 0, .2, 1) forwards; }
@keyframes travel {
  0% { transform: translate(0, 0); opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)); opacity: 0; }
}
.panel { display: grid; gap: 12px; justify-items: center; text-align: center; }
.seg { display: inline-flex; background: var(--sunk); padding: 3px; border-radius: 999px; }
.seg button { font: 600 .85rem var(--f-body); border: 0; background: none; color: var(--muted); padding: 7px 14px; border-radius: 999px; cursor: pointer; }
.seg button[aria-pressed=true] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(20, 35, 59, .12); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.readout { font-size: .93rem; color: var(--muted); max-width: 40ch; min-height: 3em; }
.readout b { color: var(--ink); }
.readout b.bad { color: var(--bad); }
</style>
