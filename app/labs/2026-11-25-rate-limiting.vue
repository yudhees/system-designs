<!-- sdl:title: Rate Limiting -->
<!-- sdl:topic: Rate limiting -->
<template>
  <div class="labdoc">
  <header class="hero">
    <span class="eyebrow">System Design Lab · 25 Nov 2026 · Rate limiting</span>
    <h1>Counting requests across a fleet without letting 2× the limit through</h1>
    <p class="lede">Cloudflare had to enforce per-IP limits for millions of domains from every edge server at once. Stripe had to stop one customer's script from degrading the API for everyone. Both ended up with approximate, cheap counters in a shared store, and both chose them over exact ones on purpose.</p>
  </header>

  <section>
    <span class="eyebrow">The problem at scale</span>
    <h2>What forced the design</h2>
    <div class="facts">
      <div class="fact"><span class="n">400k rps</span><span>largest attack mitigated against a single domain by Cloudflare's rate limiter, which processes several billion requests a day</span><span class="src">Cloudflare, 2017</span></div>
      <div class="fact"><span class="n">0.003%</span><span>of 400M requests from 270k sources wrongly allowed or limited by the sliding-window approximation; average error vs. true rate 6%</span><span class="src">Cloudflare, 2017</span></div>
      <div class="fact"><span class="n">Millions</span><span>of requests rejected in one month by Stripe's request-rate limiter, vs ~12,000 by the concurrency limiter and ~100 by the worker load shedder</span><span class="src">Stripe, 2017</span></div>
      <div class="fact"><span class="n">20%</span><span>of fleet capacity Stripe's load shedder can reserve for critical calls such as creating charges; non-critical traffic past 80% gets a 503</span><span class="src">Stripe, 2017</span></div>
    </div>
    <div class="two">
      <p><b>Cloudflare.</b> Edge nodes run NGINX in each PoP. A central counter store was ruled out for latency and availability, so each PoP keeps counters in a memcache (Twemcache) cluster behind Twemproxy, which spreads keys with consistent hashing. The store only had <code>GET</code>, <code>SET</code> and atomic <code>INCR</code>. CAS was rejected because under attack contention most CAS transactions would fail. Increments are asynchronous, and once a client is over the limit a mitigation flag with a known expiry is cached in memory on every server, so blocked traffic stops touching the store.</p>
      <p><b>Stripe.</b> A layered set of four limiters on Redis: a per-user <b>token bucket</b> request-rate limiter that allows short bursts, a <b>concurrent-requests</b> limiter (e.g. 20 in flight) for expensive endpoints, and two <b>load shedders</b> keyed on traffic class rather than user. They dark-launched each limiter to see what it would block, put them behind feature flags, and made them <b>fail open</b>, so a Redis failure never takes the API down.</p>
    </div>
  </section>

  <section>
    <span class="eyebrow">The concept</span>
    <h2>Three counters, three failure modes</h2>
    <p>A rate limiter answers one question per request: has this key used more than <i>L</i> units in the last <i>W</i> seconds? The exact answer needs a log of every timestamp (O(L) memory per key). Production systems approximate it.</p>
    <div class="tbl"><table>
      <thead><tr><th>Algorithm</th><th>State per key</th><th>Behaviour</th><th>Failure mode</th></tr></thead>
      <tbody>
        <tr><td><span class="sw" style="background:var(--c-1)"></span>Fixed window</td><td>1 counter</td><td>Reset to 0 at each window boundary</td><td>Boundary burst: <i>L</i> at 0:59 plus <i>L</i> at 1:00 lets 2<i>L</i> through in two seconds</td></tr>
        <tr><td><span class="sw" style="background:var(--c-2)"></span>Sliding window counter</td><td>2 counters</td><td>Weights the previous window by how much of it still overlaps</td><td>Assumes the previous window's traffic was uniform; small over/undershoot (Cloudflare measured 6% average error)</td></tr>
        <tr><td><span class="sw" style="background:var(--c-3)"></span>Token bucket</td><td>tokens + last refill time</td><td>Refills at <i>L/W</i> per second up to capacity <i>B</i>; each request spends one</td><td>By design admits a burst of <i>B</i> on top of the sustained rate; read-modify-write must be atomic</td></tr>
      </tbody>
    </table></div>
    <div v-pre class="formula">rate ≈ prev_count × (W − elapsed) / W + curr_count
  Cloudflare's example: limit 50/min, 15 s into the minute, prev = 42, curr = 18
  rate = 42 × 45/60 + 18 = 49.5  → the next request trips the limit</div>
    <p><b>The distributed part is the hard part.</b> Every algorithm above is trivial in one process. Across N stateless tasks behind a load balancer you either share state (Redis or memcache round trip per request, plus a decision about what happens when it is down) or keep it local. Local counters with the full limit admit up to N×L. Local counters with L/N are only right if the balancer spreads one key evenly, which a single hot client never gets.</p>
  </section>

  <section>
    <span class="eyebrow">Simulation</span>
    <h2>Run all three side by side</h2>
    <p>The same request stream hits all three limiters. The chart plots the <b>true number of accepted requests in the trailing 60 seconds</b>, which is what your downstream actually feels. Choose <b>Window-edge attack</b> to watch the fixed window double the limit, then add nodes with per-node state to watch every algorithm leak.</p>
    <div class="bench">
      <div class="controls">
        <div class="ctl"><span class="lbl">Traffic pattern</span>
          <div class="seg">
            <button v-for="o in PATTERNS" :key="o.v" type="button" :aria-pressed="P.pattern === o.v" @click="setSeg('pattern', o.v)">{{ o.label }}</button>
          </div>
          <span class="hint">{{ PAT_HINT[P.pattern] }}</span>
        </div>
        <div class="ctl"><label for="rl-rate">Offered rate <output>{{ P.rate }} rps</output></label><input id="rl-rate" v-model.number="P.rate" type="range" min="1" max="40" step="1"></div>
        <div class="ctl"><label for="rl-limit">Limit L per 60 s <output>{{ P.limit }} ({{ (P.limit / W).toFixed(0) }} rps)</output></label><input id="rl-limit" :value="P.limit" type="range" min="120" max="1200" step="60" @input="setNum('limit', $event, true)"></div>
        <div class="ctl"><label for="rl-burst">Bucket capacity B <output>{{ Math.round(P.limit * P.burst / 100) }} ({{ P.burst }}% of L)</output></label><input id="rl-burst" :value="P.burst" type="range" min="5" max="100" step="5" @input="setNum('burst', $event, true)"><span class="hint">Token bucket only. Refill is always L/60 per second.</span></div>
        <div class="ctl"><label for="rl-nodes">App nodes <output>{{ P.nodes }}</output></label><input id="rl-nodes" :value="P.nodes" type="range" min="1" max="8" step="1" @input="setNum('nodes', $event, true)"></div>
        <div class="ctl"><span class="lbl">Limiter state</span>
          <div class="seg">
            <button v-for="o in MODES" :key="o.v" type="button" :aria-pressed="P.mode === o.v" @click="setSeg('mode', o.v)">{{ o.label }}</button>
          </div>
          <span class="hint">{{ MODE_HINT[P.mode] }}</span>
        </div>
        <div class="ctl"><label for="rl-speed">Sim speed <output>{{ P.speed }}×</output></label><input id="rl-speed" v-model.number="P.speed" type="range" min="5" max="60" step="5"></div>
        <div class="btns"><button type="button" class="lbtn primary" @click="P.running = !P.running">{{ P.running ? 'Pause' : 'Play' }}</button><button type="button" class="lbtn" @click="reset">Reset</button></div>
      </div>
      <div class="scope">
        <div class="scope-head">
          <div class="legend">
            <span><i class="sw" style="background:var(--c-neutral)"></i>Offered</span>
            <span v-for="a in ALG" :key="a.k"><i class="sw" :style="{ background: `var(${a.col})` }"></i>{{ a.name }}</span>
          </div>
          <span class="clock">{{ clock }}</span>
        </div>
        <canvas ref="chartEl" class="chart" aria-label="Trailing 60-second accepted requests per algorithm versus the limit" role="img"></canvas>
        <canvas ref="lanesEl" class="lanes" aria-label="Recent requests per algorithm, green accepted, red rejected" role="img"></canvas>
        <div class="meters">
          <div v-for="m in view.meters" :key="m.k" class="meter" :style="{ '--col': `var(${m.col})` }">
            <span class="name">{{ m.name }}</span>
            <div class="row"><span>Accepted</span><b>{{ m.accepted }}</b></div>
            <div class="row"><span>Rejected</span><b>{{ m.rejected }}</b></div>
            <div class="row"><span>Peak trailing 60 s</span><b>{{ m.peak }}</b></div>
            <span :class="['pill', m.tone]">{{ m.label }}</span>
          </div>
        </div>
        <div class="nodes">
          <div v-for="r in view.rows" :key="r.k" class="nrow" :style="{ '--col': `var(${r.col})` }">
            <span class="k">{{ r.label }}</span>
            <div class="ncells" :style="{ gridTemplateColumns: `repeat(${r.cells.length}, 1fr)` }">
              <div v-for="(c, i) in r.cells" :key="i" class="ncell" :title="c.title"><i :style="{ width: c.pct + '%' }"></i><em>{{ c.txt }}</em></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="callout"><p><b>What to look for.</b> On Window edge with one node, the fixed window's peak goes to about 2.0×L while the sliding counter stays near 1.0–1.1× and the token bucket admits only its burst B plus the L/60 refill during the attack. Under sustained overload the bucket's trailing count tops out near L+B. Switch to <i>Per node, L</i> with 4 nodes and every line climbs toward 4×L. <i>Per node, L/N</i> roughly holds the line for random routing but under-admits when nodes see uneven load, which is why Cloudflare and Stripe pay for the shared store.</p></div>
  </section>

  <section>
    <span class="eyebrow">Solve it</span>
    <h2>The concert-night route quota</h2>
    <div class="scenario">
      <p>A ride-hailing app asks a third-party maps provider for driving routes and arrival times. The provider's contract allows <b>50 requests/second across your whole account</b> and suspends your key for an hour after repeated 429s. The routing service runs as app servers that autoscale from 4 to 24. The same provider also prices every trip request, a call that carries revenue, while the "car is 4 minutes away" estimate on the map is nice to have. Last Friday a concert ended, riders opened the app all at once, servers scaled out, each server's in-process limiter allowed 50 rps, and the provider suspended the key mid-evening. Trip requests started failing too.</p>
      <h3>Design question</h3>
      <ul>
        <li>Where does the limit state live, and what algorithm do you use?</li>
        <li>How do you guarantee trip requests still get through when map estimates saturate the quota?</li>
        <li>What does an estimate request do when it can't get a token, and what happens if the shared store is unreachable?</li>
      </ul>
    </div>
    <details><summary>Hint 1: count the right thing</summary><div><p>The limit belongs to the provider, not to your riders. Key the limiter on the provider and credential, not on caller IP, and enforce it on the <b>outbound</b> path. Per-server limits are the "Per node, L" mode from the simulator: N servers, N×L.</p></div></details>
    <details><summary>Hint 2: Stripe's load shedder</summary><div><p>Stripe reserves a slice of capacity for critical methods. Apply the same idea to the provider: two classes of traffic, one quota.</p></div></details>
    <details><summary>Hint 3: failing open is not always right</summary><div><p>Stripe fails open because blocking its own customers is worse than briefly overrunning its own capacity. Here, overrunning means a provider ban. Which way should <i>this</i> limiter fail?</p></div></details>
    <details><summary>Model answer</summary><div class="answer">
      <ol>
        <li><b>Shared token bucket in a fast shared store</b>, key <code>rl:maps-provider</code>, rate 50/s, capacity ~50 (one second of burst, matching how providers usually meter). Read-refill-spend runs as one atomic script so it is safe across 24 servers. Leave headroom: target 45/s, since the provider's clock and window are not yours.</li>
        <li><b>Reserve capacity for trip pricing.</b> Two buckets that share the quota: estimates may only spend down to a floor (e.g. they get 40/s), pricing draws from the full 50. Equivalent: one bucket, and estimate requests are rejected when tokens &lt; reserve.</li>
        <li><b>Cut round trips with leases.</b> Each server takes tokens in small batches (e.g. 5 at a time) and spends them locally. Lease size bounds the overshoot to roughly servers × lease, so keep it small.</li>
        <li><b>No token, no provider call.</b> Serve a recent cached estimate with a stale flag, or show a rougher estimate computed locally. Do not queue estimate work: the rider has moved on by the time it runs. Pricing calls may wait briefly (bounded, e.g. 300 ms) for a token.</li>
        <li><b>Fail closed to a conservative local limit.</b> If the shared store is unreachable, each server falls back to <code>floor(45 / expected_max_servers)</code> rps from an in-process bucket, the "Per node, L/N" mode: it under-admits, but it cannot get you banned. Alert on it.</li>
        <li><b>Respect the provider's signal.</b> On a 429 or <code>Retry-After</code>, write a cooldown flag to the shared store with that TTL so every server backs off at once, the same trick Cloudflare uses with its cached mitigation flag.</li>
        <li><b>Dark launch it</b>: log would-be rejections for a week before enforcing, then turn it on behind a flag.</li>
      </ol>
      <pre v-pre class="code">-- KEYS[1]=bucket  ARGV: rate/s, capacity, now_ms, want, floor
  local b = redis.call('HMGET', KEYS[1], 't', 'ts')
  local rate, cap, now, want, floor = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
  local t  = tonumber(b[1]) or cap
  local ts = tonumber(b[2]) or now
  t = math.min(cap, t + (now - ts) / 1000 * rate)
  local granted = 0
  if t - want >= floor then t = t - want; granted = want end
  redis.call('HSET', KEYS[1], 't', t, 'ts', now)
  redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) * 2)
  return granted   -- estimates: floor = reserve; pricing: floor = 0</pre>
      <p class="hint">Use the store's own clock rather than each server's clock if server clocks may drift; passing <code>now</code> in keeps the example short.</p>
    </div></details>
  </section>

  <section>
    <span class="eyebrow">In practice</span>
    <h2>Where these ideas show up in real tools</h2>
    <div class="stack">
      <div><b>Web frameworks</b><span>Built-in rate-limit middleware usually keeps a hit counter with a decay timer in your cache, which behaves like a fixed window. That's fine for login and one-time-code abuse. For partner-facing quotas, use a shared store and an atomic token bucket like the one above.</span></div>
      <div><b>Outbound HTTP clients</b><span>Put the limiter in the client wrapper for each provider, not in route middleware. Batch token leases per server so a request that fans out to 30 providers doesn't cost 30 round trips to the shared store.</span></div>
      <div><b>Databases</b><span>Keep hot counters out of them. A per-request increment on one row or document is a write hotspot. A database is the right place for the limit <i>configuration</i> per partner and provider, loaded into the shared store or memory.</span></div>
      <div><b>Queues and logs</b><span>Rate-limit consumers, not producers. A consumer that pushes notifications to a partner can pause its partitions when that partner's bucket is empty and resume later. Lag grows instead of 429s, and lag is something you already alert on.</span></div>
      <div><b>API gateways and edge rules</b><span>Gateway throttling is usually a token bucket (steady rate plus burst) that returns <code>429</code>, and some providers document it as best-effort, a target rather than a guaranteed ceiling, so keep your own limiter for contractual limits. Edge rate rules work per IP, the Cloudflare-style first line.</span></div>
      <div><b>Autoscaling</b><span>Autoscaling changes N under you. Any per-server limit has to be derived from the maximum server count, or it silently grows the effective limit on every scale-out.</span></div>
    </div>
  </section>

  <section>
    <span class="eyebrow">Sources</span>
    <h2>Read the originals</h2>
    <ol class="sources">
      <li><a href="https://blog.cloudflare.com/counting-things-a-lot-of-different-things/" target="_blank" rel="noopener">Cloudflare: How we built rate limiting capable of scaling to millions of domains</a></li>
      <li><a href="https://stripe.com/blog/rate-limiters" target="_blank" rel="noopener">Stripe: Scaling your API with rate limiters</a></li>
      <li><a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html" target="_blank" rel="noopener">AWS: Throttle requests to your REST APIs for better throughput in API Gateway</a></li>
    </ol>
  </section>
  </div>
</template>

<script setup lang="ts">
// Rate limiting lab: three limiters see the same request stream. The engine is a plain
// mutable object stepped on a fixed clock; Vue only renders the controls, meters and node rows.
const W = 60, DT = 0.25, HIST = 300
const ALG = [{ k: 'fixed', name: 'Fixed window', col: '--c-1' }, { k: 'sliding', name: 'Sliding counter', col: '--c-2' }, { k: 'bucket', name: 'Token bucket', col: '--c-3' }]
const PATTERNS = [{ v: 'steady', label: 'Steady' }, { v: 'flash', label: 'Flash sale' }, { v: 'edge', label: 'Window edge' }]
const MODES = [{ v: 'shared', label: 'Shared store' }, { v: 'local', label: 'Per node, L' }, { v: 'split', label: 'Per node, L/N' }]
const PAT_HINT: Record<string, string> = { steady: 'Constant Poisson arrivals at the offered rate.', flash: 'Offered rate ×5 for 12 s every 90 s.', edge: 'Attacker sends 2.4×L over 16 s straddling every other window boundary; slider sets background noise.' }
const MODE_HINT: Record<string, string> = { shared: 'One counter per key in Redis or memcache; every node sees the same state.', local: 'Each node enforces the full L in memory. Effective limit up to N×L.', split: 'Each node enforces L/N. Requests are routed to a random node.' }

const P = reactive({ pattern: 'edge', rate: 6, limit: 600, burst: 25, nodes: 1, mode: 'shared', speed: 20, running: true })
const chartEl = ref<HTMLCanvasElement>()
const lanesEl = ref<HTMLCanvasElement>()
const clock = ref('t = 0 s')

interface AlgState { w: number, c: number, prev: number, tok: number | null, last: number }
interface Alg { k: string, name: string, col: string, states: AlgState[], acc: number[], ai: number, ok: number, rej: number, peak: number, series: number[], events: [number, boolean, number][] }
interface Sim { t: number, n: number, lim: number, cap: number, refill: number, alg: Alg[], off: number[], oi: number, offSeries: number[], lastSample: number }
let sim: Sim

function rateAt(t: number) {
  const r = P.rate
  if (P.pattern === 'flash') return (t % 90) < 12 ? r * 5 : r
  if (P.pattern === 'edge') { const ph = t % 120; return (ph >= 52 && ph < 68) ? (2.4 * P.limit) / 16 : Math.min(r, P.limit / W * 0.3) }
  return r
}
function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()) }
function poisson(l: number) {
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()))
  const L = Math.exp(-l); let k = 0, p = 1
  do { k++; p *= Math.random() } while (p > L)
  return k - 1
}
const newState = (): AlgState => ({ w: -1, c: 0, prev: 0, tok: null, last: 0 })
function makeSim(): Sim {
  const n = P.mode === 'shared' ? 1 : P.nodes
  const div = P.mode === 'split' ? P.nodes : 1
  const lim = P.limit / div, cap = Math.max(1, P.limit * P.burst / 100 / div), refill = P.limit / W / div
  return { t: 0, n, lim, cap, refill, alg: ALG.map(a => ({ ...a, states: Array.from({ length: n }, newState), acc: [], ai: 0, ok: 0, rej: 0, peak: 0, series: [], events: [] })), off: [], oi: 0, offSeries: [], lastSample: 0 }
}
function decide(a: Alg, t: number, node: number) {
  const s = a.states[P.mode === 'shared' ? 0 : node], lim = sim.lim
  if (a.k === 'fixed') { const w = Math.floor(t / W); if (s.w !== w) { s.w = w; s.c = 0 } if (s.c < lim) { s.c++; return true } return false }
  if (a.k === 'sliding') {
    const w = Math.floor(t / W)
    if (s.w !== w) { s.prev = (w === s.w + 1) ? s.c : 0; s.w = w; s.c = 0 }
    const el = t - w * W, est = s.prev * (W - el) / W + s.c
    if (est + 1 <= lim) { s.c++; return true } return false
  }
  if (s.tok === null) { s.tok = sim.cap; s.last = t }
  s.tok = Math.min(sim.cap, s.tok + (t - s.last) * sim.refill); s.last = t
  if (s.tok >= 1) { s.tok -= 1; return true } return false
}
function trailing(arr: number[], idx: number, t: number) { while (idx < arr.length && arr[idx] <= t - W) idx++; return idx }
function step() {
  const t0 = sim.t, n = poisson(rateAt(t0) * DT), ts: number[] = []
  for (let i = 0; i < n; i++) ts.push(t0 + Math.random() * DT)
  ts.sort((a, b) => a - b)
  for (const t of ts) {
    const node = Math.floor(Math.random() * P.nodes)
    sim.off.push(t)
    for (const a of sim.alg) { const ok = decide(a, t, node); if (ok) { a.ok++; a.acc.push(t) } else a.rej++; a.events.push([t, ok, node]) }
  }
  sim.t = t0 + DT
  const t = sim.t
  for (const a of sim.alg) {
    a.ai = trailing(a.acc, a.ai, t); if (a.ai > 5000) { a.acc = a.acc.slice(a.ai); a.ai = 0 }
    const ev = a.events; let k = 0; while (k < ev.length && ev[k][0] < t - 20) k++; if (k) ev.splice(0, k)
  }
  sim.oi = trailing(sim.off, sim.oi, t); if (sim.oi > 5000) { sim.off = sim.off.slice(sim.oi); sim.oi = 0 }
  if (t - sim.lastSample >= 1 - 1e-9) {
    sim.lastSample = t
    sim.offSeries.push(sim.off.length - sim.oi); if (sim.offSeries.length > HIST) sim.offSeries.shift()
    for (const a of sim.alg) { const v = a.acc.length - a.ai; a.series.push(v); if (a.series.length > HIST) a.series.shift(); if (t >= W) a.peak = Math.max(a.peak, v) }
  }
}

// ---- drawing (canvas; colors are read from the site tokens each frame so the theme switch applies) ----
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
function fit(c: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1
  const w = Math.round(r.width * d), h = Math.round(r.height * d)
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const x = c.getContext('2d')!
  x.setTransform(d, 0, 0, d, 0, 0)
  return [x, r.width, r.height]
}
function drawChart() {
  if (!chartEl.value) return
  const [x, w, h] = fit(chartEl.value); x.clearRect(0, 0, w, h)
  const fg = css('--muted'), line = css('--line'), ink = css('--ink'), L = P.limit
  const padL = 50, padR = 10, padT = 10, padB = 24, pw = w - padL - padR, ph = h - padT - padB
  let mx = L * 2.2
  for (const a of sim.alg) for (const v of a.series) mx = Math.max(mx, v * 1.05)
  for (const v of sim.offSeries) mx = Math.max(mx, Math.min(v, L * 4.5) * 1.05)
  const y = (v: number) => padT + ph - (Math.min(v, mx) / mx) * ph, X = (i: number) => padL + (i / (HIST - 1)) * pw
  x.font = '14px "IBM Plex Mono", monospace'; x.fillStyle = fg; x.strokeStyle = line; x.lineWidth = 1; x.textAlign = 'right'; x.textBaseline = 'middle'
  const stepL = mx > L * 4 ? L : L / 2
  for (let v = 0; v <= mx; v += stepL) { x.beginPath(); x.moveTo(padL, y(v)); x.lineTo(w - padR, y(v)); x.stroke(); x.fillText((v / L).toFixed(1) + '×L', padL - 6, y(v)) }
  x.textAlign = 'center'; x.textBaseline = 'top'
  for (let s = 0; s <= HIST; s += 60) { const i = HIST - 1 - s; if (i < 0) break; x.textAlign = s === 0 ? 'right' : 'center'; x.fillText(s === 0 ? 'now' : '−' + s + 's', s === 0 ? X(i) + 4 : X(i), h - padB + 6) }
  x.strokeStyle = ink; x.setLineDash([5, 4]); x.lineWidth = 1.2; x.beginPath(); x.moveTo(padL, y(L)); x.lineTo(w - padR, y(L)); x.stroke(); x.setLineDash([])
  x.fillStyle = ink; x.textAlign = 'left'; x.textBaseline = 'bottom'; x.fillText('limit L', padL + 4, y(L) - 2)
  const plot = (arr: number[], col: string, wd: number, fill: boolean) => {
    if (arr.length < 2) return
    const off = HIST - arr.length
    x.beginPath(); arr.forEach((v, i) => { const px = X(i + off), py = y(v); i ? x.lineTo(px, py) : x.moveTo(px, py) })
    if (fill) { x.lineTo(X(HIST - 1), y(0)); x.lineTo(X(off), y(0)); x.closePath(); x.globalAlpha = .18; x.fillStyle = col; x.fill(); x.globalAlpha = 1 } else {
      x.strokeStyle = col; x.lineWidth = wd; x.stroke()
      const lv = arr[arr.length - 1]; x.beginPath(); x.arc(X(HIST - 1), y(lv), 3, 0, 7); x.fillStyle = col; x.fill()
    }
  }
  plot(sim.offSeries, css('--c-neutral'), 1, true)
  for (const a of sim.alg) plot(a.series, css(a.col), 2, false)
  const tNow = sim.t
  clock.value = 't = ' + Math.floor(tNow) + ' s · window ' + Math.floor(tNow / W) + ' · +' + (tNow % W).toFixed(0) + ' s'
}
function drawLanes() {
  if (!lanesEl.value) return
  const [x, w, h] = fit(lanesEl.value); x.clearRect(0, 0, w, h)
  const padL = 124, rowH = h / 3, t = sim.t, ok = css('--ok'), bad = css('--bad')
  x.font = '14px "IBM Plex Sans", sans-serif'; x.textBaseline = 'middle'
  sim.alg.forEach((a, r) => {
    const cy = r * rowH + rowH / 2
    x.fillStyle = css('--sunk'); x.fillRect(padL, r * rowH + 4, w - padL, rowH - 8)
    x.fillStyle = css(a.col); x.fillRect(0, cy - 5, 10, 10); x.fillStyle = css('--ink'); x.textAlign = 'left'; x.fillText(a.name, 16, cy)
    const ev = a.events, stride = Math.max(1, Math.ceil(ev.length / 700))
    for (let i = 0; i < ev.length; i += stride) {
      const [et, o, nd] = ev[i]
      const px = padL + (1 - (t - et) / 20) * (w - padL)
      const jit = ((nd * 37 + i * 13) % ((rowH - 14) | 0 || 1))
      x.fillStyle = o ? ok : bad; x.globalAlpha = o ? .85 : .95; x.fillRect(px - 1.5, r * rowH + 7 + jit, 3, 3)
    }
    x.globalAlpha = 1
  })
}

// ---- view model for the meters and node rows ----
interface Meter { k: string, col: string, name: string, accepted: string, rejected: string, peak: string, tone: string, label: string }
interface NodeRow { k: string, col: string, label: string, cells: { title: string, pct: number, txt: string }[] }
const view = ref<{ meters: Meter[], rows: NodeRow[] }>({ meters: [], rows: [] })
function refreshView() {
  const meters = sim.alg.map((a): Meter => {
    const tot = a.ok + a.rej, pk = a.peak / P.limit, over = pk > 1.2, slight = pk > 1.05 && !over, warm = sim.t < W
    return { k: a.k, col: a.col, name: a.name, accepted: `${a.ok.toLocaleString('en')} / ${tot.toLocaleString('en')}`, rejected: `${tot ? (a.rej / tot * 100).toFixed(1) : '0.0'}%`, peak: warm ? 'warming up' : pk.toFixed(2) + '×L', tone: warm ? 'ok' : over ? 'bad' : slight ? 'warn' : 'ok', label: warm ? 'collecting' : over ? 'over limit' : slight ? 'slight overshoot' : 'within limit' }
  })
  const lim = sim.lim
  const rows = sim.alg.map((a): NodeRow => {
    const cells = a.states.map((s, i) => {
      let frac: number, txt: string; const t = sim.t
      if (a.k === 'fixed') { const v = s.w === Math.floor(t / W) ? s.c : 0; frac = v / lim; txt = Math.round(v) + '/' + Math.round(lim) }
      else if (a.k === 'sliding') { const w = Math.floor(t / W); const prev = s.w === w ? s.prev : (s.w === w - 1 ? s.c : 0); const cur = s.w === w ? s.c : 0; const v = prev * (W - (t - w * W)) / W + cur; frac = v / lim; txt = v.toFixed(0) + '/' + Math.round(lim) }
      else { const tk = s.tok === null ? sim.cap : Math.min(sim.cap, s.tok + (t - s.last) * sim.refill); frac = tk / sim.cap; txt = tk.toFixed(0) + ' tok' }
      return { title: P.mode === 'shared' ? 'Shared store' : 'Node ' + (i + 1), pct: Math.min(100, frac * 100), txt }
    })
    return { k: a.k, col: a.col, label: `${a.k} · ${P.mode === 'shared' ? 'shared' : a.states.length + '×'}`, cells }
  })
  view.value = { meters, rows }
}

function reset() { sim = makeSim(); refreshView(); drawChart(); drawLanes() }
function setSeg(key: 'pattern' | 'mode', v: string) { P[key] = v; reset() }
function setNum(key: 'limit' | 'burst' | 'nodes', e: Event, doReset: boolean) { P[key] = +(e.target as HTMLInputElement).value; if (doReset) reset() }

let raf = 0, stopped = false
let io: IntersectionObserver | undefined
onMounted(() => {
  reset()
  // pre-run so the first frame already shows a full boundary attack
  for (let i = 0; i < Math.round(150 / DT); i++) step()
  refreshView()
  let acc = 0, last = performance.now(), uiT = 0, visible = true
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
  if (chartEl.value) io.observe(chartEl.value)
  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(.1, (now - last) / 1000); last = now
    if (visible) {
      if (P.running) { acc += dt * P.speed * (reduce ? .5 : 1); let g = 0; while (acc >= DT && g < 400) { step(); acc -= DT; g++ } }
      drawChart(); drawLanes(); uiT += dt
      if (uiT > .2) { refreshView(); uiT = 0 }
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); io?.disconnect() })
</script>

<style scoped>
.chart { height: 260px; }
.lanes { height: 126px; }
.meters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 560px) { .meters { grid-template-columns: 1fr; } }
.meter { border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; display: flex; flex-direction: column; gap: 6px; border-top: 3px solid var(--col); }
.meter .name { font-weight: 600; font-size: .95rem; }
.meter .row { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: .9rem; color: var(--muted); }
.meter .row b { font-family: var(--f-mono); color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
.nodes { display: flex; flex-direction: column; gap: 6px; }
.nrow { display: grid; grid-template-columns: 150px 1fr; gap: 8px; align-items: center; font-size: .9rem; }
.nrow .k { color: var(--muted); font-family: var(--f-mono); }
.ncells { display: grid; gap: 4px; }
.ncell { height: 24px; background: var(--sunk); border-radius: 3px; position: relative; overflow: hidden; }
.ncell i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--col); opacity: .75; }
.ncell em { position: absolute; inset: 0; font-style: normal; font-family: var(--f-mono); font-size: .875rem; display: flex; align-items: center; justify-content: center; color: var(--ink); }
</style>
