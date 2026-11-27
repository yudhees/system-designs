<script setup lang="ts">
/**
 * Hero demo: a load balancer in front of three servers.
 * Click a server to crash it, switch to rush hour, and watch the survivors take the traffic.
 */
const CAP = 60 // requests per second one server can handle
const modes = [{ id: 'normal', label: 'Normal day', rps: 90 }, { id: 'rush', label: 'Rush hour', rps: 150 }] as const
const rush = ref(false)
const up = ref([true, true, true])
const rps = computed(() => (rush.value ? 150 : 90))
const alive = computed(() => up.value.filter(Boolean).length)
const share = computed(() => (alive.value ? rps.value / alive.value : 0))
const servers = computed(() => up.value.map((u, i) => {
  const load = u ? share.value : 0
  return { i, name: `Server ${i + 1}`, u, load, hot: u && load > CAP, y: 24 + i * 108 }
}))
const dropped = computed(() => servers.value.reduce((n, s) => n + (s.hot ? s.load - CAP : 0), 0) + (alive.value ? 0 : rps.value))
const status = computed(() => {
  if (!alive.value) return { tone: 'bad', text: 'Everything is down. Every request fails. Recover a server.' }
  if (dropped.value > 0) return { tone: 'bad', text: `Overloaded: about ${Math.round(dropped.value)} of ${rps.value} requests per second are failing. Add capacity or recover a server.` }
  if (alive.value < 3) return { tone: 'warn', text: `${3 - alive.value} down, but the load balancer rerouted. Nobody noticed.` }
  return { tone: 'ok', text: 'Traffic is split evenly. Click a server to crash it.' }
})
function toggle(i: number) { up.value = up.value.map((v, k) => (k === i ? !v : v)) }
function reset() { up.value = [true, true, true]; rush.value = false }
</script>

<template>
  <figure class="lb" aria-label="Load balancer demo">
    <svg viewBox="0 0 460 340" role="img" aria-label="Users send requests to a load balancer, which spreads them over three servers">
      <!-- users -->
      <g>
        <rect x="2" y="132" width="86" height="76" rx="14" class="box" />
        <text x="45" y="165" text-anchor="middle" class="t1">Users</text>
        <text x="45" y="188" text-anchor="middle" class="t2">{{ rps }} req/s</text>
      </g>
      <line x1="88" y1="170" x2="150" y2="170" class="flow in" :stroke-width="rush ? 5 : 3" />
      <!-- balancer -->
      <g>
        <rect x="150" y="122" width="96" height="96" rx="48" class="lbbox" />
        <text x="198" y="165" text-anchor="middle" class="t1 inv">Load</text>
        <text x="198" y="186" text-anchor="middle" class="t1 inv">balancer</text>
      </g>
      <!-- links + servers -->
      <g v-for="s in servers" :key="s.i">
        <path :d="`M246 170 C 290 170, 280 ${s.y + 40}, 316 ${s.y + 40}`" :class="['flow', s.u ? (s.hot ? 'hot' : 'on') : 'off']" :stroke-width="s.u ? 2 + s.load / 25 : 2" fill="none" />
        <g :class="['srv', { down: !s.u }]" role="button" tabindex="0" :aria-label="`${s.name} is ${s.u ? 'up. Press to crash it' : 'down. Press to recover it'}`" @click="toggle(s.i)" @keydown.enter.prevent="toggle(s.i)" @keydown.space.prevent="toggle(s.i)">
          <rect x="316" :y="s.y" width="142" height="80" rx="14" :class="['card', s.u ? (s.hot ? 'hot' : 'ok') : 'dead']" />
          <text x="332" :y="s.y + 28" class="t1">{{ s.name }}</text>
          <text x="332" :y="s.y + 50" class="t2">{{ s.u ? `${Math.round(s.load)} req/s` : 'Crashed' }}</text>
          <rect x="332" :y="s.y + 60" width="110" height="8" rx="4" class="track" />
          <rect x="332" :y="s.y + 60" :width="s.u ? Math.min(110, (s.load / CAP) * 110) : 0" height="8" rx="4" :class="['fill', s.hot ? 'hot' : 'ok']" />
        </g>
      </g>
    </svg>

    <div class="row">
      <div class="seg" role="group" aria-label="Traffic">
        <button v-for="m in modes" :key="m.id" type="button" :class="{ on: (m.id === 'rush') === rush }" @click="rush = m.id === 'rush'">{{ m.label }}</button>
      </div>
      <button type="button" class="reset" @click="reset">Reset</button>
    </div>
    <figcaption :class="['say', status.tone]" aria-live="polite">{{ status.text }}</figcaption>
    <p class="hint">Each server handles {{ CAP }} requests per second.</p>
  </figure>
</template>

<style scoped>
.lb { margin: 0; display: grid; gap: 14px; max-width: 480px; width: 100%; margin-inline: auto; }
svg { width: 100%; height: auto; display: block; overflow: visible; background: var(--surface); border: 1.5px solid var(--line); border-radius: var(--r-lg); padding: 14px 12px; }
.t1 { font: 700 16px var(--f-body); fill: var(--ink); }
.t2 { font: 500 14px var(--f-body); fill: var(--muted); }
.t1.inv { fill: var(--bg); }
.box { fill: var(--surface); stroke: var(--line); stroke-width: 2; }
.lbbox { fill: var(--ink); }
.card { stroke-width: 2; transition: fill .35s, stroke .35s, opacity .35s; }
.card.ok { fill: var(--surface); stroke: var(--line); }
.card.hot { fill: color-mix(in srgb, var(--bad) 14%, var(--surface)); stroke: var(--bad); }
.card.dead { fill: var(--sunk, var(--surface)); stroke: var(--line); stroke-dasharray: 6 5; }
.srv text { transition: opacity .3s; }
.srv.down text { opacity: .55; }
.lbbox { transform-box: fill-box; transform-origin: center; animation: pulse 3s ease-in-out infinite; }
@keyframes pulse { 50% { transform: scale(1.04); } }
.srv { cursor: pointer; }
.srv:hover .card.ok, .srv:focus-visible .card.ok { stroke: var(--signal); }
.srv:focus-visible { outline: none; }
.track { fill: var(--line); }
.fill.ok { fill: var(--ok); transition: width .3s; }
.fill.hot { fill: var(--bad); transition: width .3s; }
.flow { transition: stroke .3s, stroke-width .4s, opacity .3s; stroke: var(--signal); stroke-linecap: round; stroke-dasharray: 2 10; animation: dash .9s linear infinite; transition: stroke-width .3s; }
.flow.hot { stroke: var(--bad); }
.flow.off { stroke: var(--line); animation: none; stroke-dasharray: 4 8; }
@keyframes dash { to { stroke-dashoffset: -12; } }
@media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
.row { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.seg { display: inline-flex; background: var(--sunk, var(--surface)); border: 1.5px solid var(--line); border-radius: 999px; padding: 3px; }
.seg button { font: 600 .95rem var(--f-body); color: var(--muted); background: none; border: 0; padding: 8px 16px; border-radius: 999px; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
.reset { font: 600 .95rem var(--f-body); background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; padding: 8px; }
.say { margin: 0; font-weight: 600; font-size: 1.05rem; line-height: 1.45; min-height: 3em; padding: 12px 16px; border-radius: var(--r-md); background: var(--surface); border: 1.5px solid var(--line); }
.say.warn { border-color: var(--spark); }
.say.bad { border-color: var(--bad); }
.say.ok { border-color: var(--ok); }
.hint { margin: 0; color: var(--muted); font-size: .92rem; text-align: center; }
</style>
