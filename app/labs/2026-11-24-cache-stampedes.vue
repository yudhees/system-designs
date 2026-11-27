<!-- sdl:title: Cache Stampedes -->
<!-- sdl:topic: Caching -->
<template>
  <div class="labdoc">
    <header class="hero">
      <div class="eyebrow">System Design Lab · 2026-11-24 · Caching</div>
      <h1>Cache stampedes and request coalescing</h1>
      <p class="lede">A hot key expires. For the next δ seconds, every reader misses and goes to the origin. With an arrival rate λ on that key and a recompute time δ, the origin takes roughly λ·δ concurrent requests for one value. A cache that is meant to protect the origin can end up overloading it.</p>
      <div v-pre class="formula">concurrent origin hits at expiry ≈ λ<sub>key</sub> × δ<sub>recompute</sub> &nbsp;&nbsp;// e.g. 50 req/s × 0.5 s ≈ 25 (Fastly's example)</div>
    </header>

    <section>
      <div class="eyebrow">The real problem</div>
      <h2>What scale forced the design</h2>
      <p>Facebook's memcache tier, described in the 2013 NSDI paper, <em>handles billions of requests per second and holds trillions of items</em>. They hit two related failures on keys with heavy read and write traffic. One was <strong>stale sets</strong>, where a slow writer puts an outdated value back into the cache. The other was <strong>thundering herds</strong>, where every reader that misses goes to MySQL at once. Their fix was <strong>leases</strong>. On a miss, memcached gives the client a 64-bit token, and only the holder of that token may set the value. To stop herds, each server hands out a token only once every 10 seconds per key. Other readers are told to wait briefly and retry, and by then the value is usually in the cache.</p>
      <div class="facts">
        <div class="fact"><span class="n">17K/s</span><span>Peak DB query rate in Facebook's thundering-herd test without leases</span><span class="src"><a href="https://pdos.csail.mit.edu/6.824/papers/memcache-fb.pdf">Nishtala et al., NSDI '13</a></span></div>
        <div class="fact"><span class="n">1.3K/s</span><span>Peak DB query rate in the same test with leases, about a 13× reduction</span><span class="src"><a href="https://pdos.csail.mit.edu/6.824/papers/memcache-fb.pdf">Nishtala et al., NSDI '13</a></span></div>
        <div class="fact"><span class="n">1 / 10 s</span><span>Default rate at which a server issues a lease token for each key</span><span class="src"><a href="https://pdos.csail.mit.edu/6.824/papers/memcache-fb.pdf">Nishtala et al., NSDI '13</a></span></div>
        <div class="fact"><span class="n">~25</span><span>Concurrent origin fetches for an object requested 50×/s with 500 ms fetch latency, before collapsing</span><span class="src"><a href="https://www.fastly.com/documentation/guides/concepts/cache/request-collapsing/">Fastly docs</a></span></div>
      </div>
      <p>The same problem appears at the CDN layer. Cloudflare's write-up starts from an image service that gets 10 req/s while its origin can serve 1. When the cached copy expires, all 10 go through. Cloudflare's <em>cache lock</em> sends the origin one request at a time per asset, and concurrent misses in a data centre wait for that response. Fastly calls its version a <em>waiting list</em>. CloudFront says it <em>pauses</em> simultaneous requests that share a cache key and fans out the first response to them.</p>
    </section>

    <section>
      <div class="eyebrow">The concept</div>
      <h2>Four ways to stop the herd, and how each one fails</h2>
      <p>All four do the same thing: they decouple <em>reader concurrency</em> from <em>origin concurrency</em> for one key. They differ in who pays the latency, what correctness you give up, and which new component can break.</p>
      <div class="tbl"><table>
        <thead><tr><th>Technique</th><th>Mechanism</th><th>Cost / trade-off</th><th>Failure mode</th></tr></thead>
        <tbody>
          <tr><td>Single-flight lock<br><span class="muted mono">request collapsing</span></td><td>First miss takes a per-key lock and fetches. Later misses join a waiting list and get its result.</td><td>Waiters pay the full δ. A distributed lock adds an extra write per refresh.</td><td>The lock holder dies or hangs, so waiters stall until the lock TTL. An uncacheable response forces the queue to go to origin <em>one at a time</em> (Fastly: "sometimes adding several minutes of latency").</td></tr>
          <tr><td>Stale-while-revalidate</td><td>Serve the expired value now and refresh in the background, ideally behind a single-flight.</td><td>Readers see bounded staleness. Needs a soft TTL and a hard TTL.</td><td>Doesn't help a <em>cold</em> or evicted key, because there is nothing stale to serve. Wrong for data that must be exact, such as the final price at booking.</td></tr>
          <tr><td>Probabilistic early expiration<br><span class="muted mono">XFetch, VLDB 2015</span></td><td>Each reader recomputes early with a probability that rises as expiry nears: <code>now − δ·β·ln(rand) ≥ expiry</code>.</td><td>No coordination. Needs δ stored with the value. β &gt; 1 refreshes earlier.</td><td>No protection after real expiry, eviction or a flush, which stampede exactly like naive TTL. With very large λ, a few duplicate recomputes still slip through.</td></tr>
          <tr><td>Leases<br><span class="muted mono">Facebook memcache</span></td><td>A miss returns a token only once per interval per key. Others back off and retry, or accept a stale value.</td><td>Retries add cache round-trips. The token also prevents stale sets.</td><td>If the holder's fetch fails, others wait for the next token window. If the lease interval is longer than the TTL, readers time out.</td></tr>
        </tbody>
      </table></div>
      <p>Two more points. <strong>Synchronised expiry</strong> is a separate trigger. A deploy that flushes the cache, or a batch warm-up, gives thousands of keys the same expiry time. Per-key locks don't help there, but TTL jitter does. And collapsing happens <strong>per collapsing point</strong>. Forty app tasks with in-process single-flight still send up to 40 fetches per key, so you need a shared layer (Redis lock, CDN shield) as well. Fastly's clustering plus shielding gives up to four collapsing points per object.</p>
    </section>

    <section id="lab">
      <div class="intro">
        <div class="eyebrow">Simulator</div>
        <h2>Watch the herd form</h2>
        <p>Both lanes get the <em>same</em> arrival stream over a Zipf-distributed key set, so key 0 is hottest. The left lane is a plain TTL cache. The right lane uses the strategy you pick. The origin models a backend service with limited capacity. Past its concurrency limit its latency grows, and above 3× the limit it rejects calls immediately with 429s. A rejected fetch leaves the cache empty, so the herd keeps going. Hit <strong>Flush cache</strong> to simulate a deploy, or <strong>Spike ×5</strong> to simulate a promo push.</p>
      </div>
      <div class="cs-bench">
        <div class="cs-stack">
          <div class="ctl"><label>Right-lane strategy</label>
            <div class="pills" role="group" aria-label="Strategy">
              <button v-for="o in STRATS" :key="o.s" type="button" :aria-pressed="P.strat === o.s" @click="setStrat(o.s)">{{ o.label }}</button>
            </div>
          </div>
          <p class="stratnote">{{ NOTES[P.strat][2] }}</p>
        </div>
        <div class="cs-controls">
          <div v-for="c in SLIDERS" :key="c.id" class="ctl"><label :for="`cs-${c.id}`">{{ c.label }} <output>{{ c.fmt(P[c.id]) }}</output></label><input :id="`cs-${c.id}`" :value="P[c.id]" type="range" :min="c.min" :max="c.max" :step="c.step" @input="setP(c.id, $event)"></div>
        </div>
        <div class="actions">
          <button class="pbtn primary" type="button" @click="flush">Flush cache</button>
          <button class="pbtn" type="button" @click="spike">Spike ×5 (10 s)</button>
          <button class="pbtn" type="button" @click="togglePause">{{ paused ? 'Run' : 'Pause' }}</button>
          <button class="pbtn" type="button" @click="resetSim">Reset</button>
          <span class="clock">{{ clock }}</span>
        </div>
        <div class="legend">
          <span><i class="dot" style="background:var(--ok)"></i>cache hit</span>
          <span><i class="dot" style="background:var(--spark)"></i>stale served</span>
          <span><i class="dot" style="background:var(--c-4)"></i>waiting / retrying</span>
          <span><i class="dot" style="background:var(--bad)"></i>origin fetch</span>
          <span>Cache cells: one per key, filled = fresh (fades toward expiry), amber = stale, outlined = refresh in flight</span>
        </div>
        <div class="lanes">
          <div v-for="ln in LANES" :key="ln.id" class="lane">
            <h3><template v-if="ln.id === 'A'">Naive TTL <small>every miss fetches</small></template><template v-else>{{ NOTES[P.strat][0] }} <small>{{ NOTES[P.strat][1] }}</small></template></h3>
            <canvas :ref="(el) => setCv(ln.id, 'lane', el)" class="cv-lane" role="img" :aria-label="`${ln.id === 'A' ? 'Naive TTL' : NOTES[P.strat][0]} lane: clients, cache cells and origin load`"></canvas>
            <div class="metrics">
              <div v-for="m in metrics[ln.id]" :key="m.k" :class="['metric', m.cls]"><div class="k">{{ m.k }}</div><div class="v">{{ m.v }}</div></div>
            </div>
            <canvas :ref="(el) => setCv(ln.id, 'chart', el)" class="cv-chart" role="img" aria-label="Peak in-flight origin calls over the last 60 seconds"></canvas>
            <div class="chartcap">peak in-flight origin calls per 0.5 s · last 60 s · dashed = limit</div>
          </div>
        </div>
        <p class="hint">Things to try: (1) Single-flight at defaults, then raise keys to 48 and press Flush. The per-key herd disappears, but 48 simultaneous refreshes still hit a limit of 12. Add jitter. (2) XFetch: let it run through a few TTLs, where the right lane stays flat, then Flush. It stampedes like naive. (3) Lease with TTL 5 s. The 10 s token interval is longer than the TTL, so waiters time out. (4) SWR with δ = 3000 ms: p99 stays at cache latency while staleness rises.</p>
      </div>
    </section>

    <section id="solve">
      <div class="eyebrow">Solve it</div>
      <h2>The flash sale</h2>
      <div class="scenario">
        <p>An online shop serves product pages from 40 identical app servers behind a load balancer. Prices and stock come from a shared pricing service and are cached under a key like <code>product:{id}:price</code> with a 15-minute TTL. The pricing service is the fragile part. Its limits:</p>
        <ul>
          <li>It handles about <strong>50 requests/s</strong>. Above that it starts returning errors, and repeated overload makes it shed load for 10 minutes.</li>
          <li>A price lookup takes p50 1.2 s and p99 6 s. You give up after 8 s.</li>
        </ul>
        <p>At 20:00 a "flash sale" notification goes out. Traffic jumps to about <strong>500 page views/s</strong> for 30 minutes, spread over roughly 2,000 distinct products with a long tail. The 20 hottest products take 40% of traffic. To make it worse, a release went out at 19:55 and its deploy script flushed the cache.</p>
        <p><strong>Design the read path for prices so the pricing service never sees more than 50 req/s, page p95 stays under 1.5 s, and a pricing outage degrades the page instead of breaking it.</strong> State what you would do inside one server, across the cluster and at the pricing-service boundary, and what is allowed to be stale.</p>
      </div>
      <details><summary>Hint 1: Size the two herds separately</summary><div class="dbody"><p>Per-key herd: the top products get about 500 × 0.4 / 20 = 10 req/s each. With δ ≈ 1.2 s that is about 12 concurrent misses per hot key, times 40 servers if each collapses only locally. Synchronised herd: after the flush, all 2,000 keys are cold at 20:00 and are all warmed within seconds, so they expire together at 20:15. Even perfect single-flight means 2,000 fetches against 50 req/s, which is 40 s of backlog.</p></div></details>
      <details><summary>Hint 2: Separate "show a price" from "charge a price"</summary><div class="dbody"><p>A product page can tolerate a price that is a few minutes old. Checkout cannot. That split tells you where stale-while-revalidate is safe and where you need a live re-check.</p></div></details>
      <details><summary>Hint 3: Who is allowed to call the pricing service?</summary><div class="dbody"><p>If any request path can call it directly, the 50 req/s limit is only enforced by hoping. Consider a single admission point that every fetch, foreground or background, has to pass.</p></div></details>
      <details class="answer"><summary>Reveal model answer</summary><div class="dbody">
        <ol>
          <li><strong>Collapse in two tiers.</strong> Inside each server, keep a map of in-flight fetches per key so 12 concurrent local misses become 1. Across servers, take a short-lived lock in the shared cache with a compare-and-set, such as <code>SET lock:{key} {token} NX PX 10000</code>. Make the lock's lifetime longer than the 8 s timeout so a slow fetch doesn't let a second one start. Losers wait briefly with jitter, for at most about 1 s, then fall back to a stale value or a "checking price" placeholder. Release with a compare-and-delete on the token, so a holder that outlived its lock can't delete someone else's.</li>
          <li><strong>Soft and hard TTL with stale-while-revalidate for pages.</strong> Store <code>{price, fetchedAt, softExp, hardExp, delta}</code>, for example soft 15 min (±15% jitter) and hard 2 h. Between soft and hard, serve the cached price and queue a refresh. This keeps p95 at cache latency even when the pricing service is at p99.</li>
          <li><strong>Refresh before expiry on hot keys.</strong> Apply the XFetch test with the stored <code>delta</code> on reads. That gives early, decorrelated refresh for hot keys at no coordination cost, and keeps them from ever reaching the soft TTL.</li>
          <li><strong>One admission point for the pricing service.</strong> No request path calls it directly. Foreground misses and background refreshes all go through a shared token bucket, or a refresh queue keyed by cache key so duplicates collapse. Run it below the limit, around 45 req/s, and give interactive cold misses priority over background refreshes. When the bucket is empty, serve stale. If there is no stale value, render the page without that price.</li>
          <li><strong>Never mass-flush on deploy.</strong> Change the key prefix only when the stored format changes. If you must start cold, pre-warm the top N keys by traffic from yesterday's logs through the same rate-limited queue, spread over minutes.</li>
          <li><strong>Make failure cheap.</strong> Cache errors and "not available" results as negative entries with a short TTL (30–60 s) so a failing service doesn't get called on every page view. Put a circuit breaker on errors and timeouts that switches the path to stale-only. Serve stale on error.</li>
          <li><strong>Live re-check at checkout.</strong> When the shopper presses "Buy", make one fresh, uncached price call for that single item, protected by an idempotency key. Show a price-change notice if it moved. This is the one place where staleness is not acceptable, and its volume is small.</li>
        </ol>
        <p class="muted">Check the numbers. With 2,000 keys and jittered soft TTLs of 12.75–17.25 min, steady-state refresh is about 2,000 / 900 s ≈ 2.2 req/s on average, far under 50. The flush backlog of 2,000 fetches at 45 req/s drains in about 44 s while pages show a placeholder for cold tail products. The 20 hot keys get prioritised and are warm in under a second.</p>
      </div></details>
    </section>

    <section>
      <div class="eyebrow">In practice</div>
      <h2>Where these ideas show up in real tools</h2>
      <div class="map">
        <div><h3>Application frameworks</h3><p>Many web frameworks ship a "serve stale while refreshing" cache helper and an atomic lock. Prefer those over hand-rolled code. Wrap the miss in the lock, wait only a short time, and fall back to the stale value if the lock isn't free.</p></div>
        <div><h3>In-process single-flight</h3>
    <pre v-pre class="code"><code>const inflight = new Map();
    function once(key, fn) {
      if (inflight.has(key)) return inflight.get(key);
      const p = fn().finally(() =&gt; inflight.delete(key));
      inflight.set(key, p);
      return p;
    }</code></pre><p>The idea works in any language: one map of in-flight work per process. It only collapses requests inside one server, so layer a shared lock behind it, and release the lock with a compare-and-delete on the token.</p></div>
        <div><h3>Databases as caches</h3><p>If a database holds the cached value, store the soft expiry and the recompute time in the row. Built-in expiry jobs usually run on a schedule, often about once a minute, so don't rely on them for freshness. Check the soft expiry in code.</p></div>
        <div><h3>Queues and logs</h3><p>Send refreshes through a queue keyed by cache key, so duplicates land together and a consumer can drop one when the stored value is already newer. Cap load on the backend with consumer concurrency plus a shared token bucket, not with the number of partitions.</p></div>
        <div><h3>CDNs and load balancers</h3><p>Many CDNs already collapse simultaneous requests for the same cache key. Headers such as <code>private</code>, <code>no-store</code> or <code>max-age=0</code> can turn that off, so check what your API sends. The number of app servers sets how wide the local fan-out is.</p></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">Sources</div>
      <h2>Read the originals</h2>
      <ol class="sources">
        <li><a href="https://pdos.csail.mit.edu/6.824/papers/memcache-fb.pdf">Nishtala et al., "Scaling Memcache at Facebook", NSDI 2013</a> (§3.2.1 Leases: 10 s token rate, 17K/s → 1.3K/s)</li>
        <li><a href="https://engineering.fb.com/core-data/scaling-memcache-at-facebook/">Meta Engineering: Scaling Memcache at Facebook</a></li>
        <li><a href="https://mail.vldb.org/pvldb/volumes/8/paper/Optimal%20Probabilistic%20Cache%20Stampede%20Prevention">Vattani, Chierichetti, Lowenstein, "Optimal Probabilistic Cache Stampede Prevention", PVLDB 8 (2015)</a></li>
        <li><a href="https://blog.cloudflare.com/sometimes-i-cache/">Cloudflare blog: "Sometimes I cache: implementing lock-free probabilistic caching"</a></li>
        <li><a href="https://developers.cloudflare.com/cache/concepts/revalidation/">Cloudflare docs: Revalidation and request collapsing</a></li>
        <li><a href="https://www.fastly.com/documentation/guides/concepts/cache/request-collapsing/">Fastly docs: Request collapsing</a></li>
        <li><a href="https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorS3Origin.html">AWS docs: CloudFront request and response behavior (simultaneous requests / collapsing)</a></li>
        <li><a href="https://en.wikipedia.org/wiki/Cache_stampede">Wikipedia: Cache stampede (XFetch pseudocode, mitigation trade-offs)</a></li>
      </ol>
      <p class="hint">The simulator is a simplified model: Poisson arrivals, a linear latency penalty past the concurrency limit, and immediate 429s above 3× the limit. The lease lane uses a fixed 10 s token interval, 50 ms retries and a 3 s give-up. Read its numbers for relative behaviour, not as benchmarks.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
// Cache stampedes lab: two lanes get the same request stream; the left is a naive TTL cache,
// the right uses the chosen strategy. The simulation engine below is plain mutable state stepped
// on a fixed clock; Vue renders the controls and metrics, the canvases draw the lanes.
const DT = 0.005, LEASE = 10, RETRY = 0.05, GIVEUP = 3
type Strat = 'sf' | 'swr' | 'xf' | 'lease'
const STRATS: { s: Strat, label: string }[] = [{ s: 'sf', label: 'Single-flight lock' }, { s: 'swr', label: 'Stale-while-revalidate' }, { s: 'xf', label: 'XFetch (early, probabilistic)' }, { s: 'lease', label: 'Lease (memcache)' }]
const NOTES: Record<Strat, [string, string, string]> = {
  sf: ['Single-flight lock', 'one fetch per key', 'The first miss for a key fetches. Concurrent misses wait on that in-flight fetch and get its result. Waiters pay δ, and origin concurrency is capped at one per key. Watch what happens when many keys expire together.'],
  swr: ['Stale-while-revalidate', 'serve stale, refresh behind', 'Once a value has expired, readers get it instantly as stale and one background refresh runs. Latency stays flat, but cold keys (after a flush) have nothing stale to serve and fall back to naive misses.'],
  xf: ['XFetch', 'probabilistic early refresh', 'Each read recomputes early if now − δ·β·ln(rand) ≥ expiry. Hot keys refresh before they expire with no coordination. After real expiry or a flush there is no protection.'],
  lease: ['Lease', 'token per key every 10 s', 'A miss gets a token if none was issued in the last 10 s. Everyone else retries every 50 ms. The token holder fills the cache. If the TTL is shorter than the lease interval, or the holder fails, waiters time out after 3 s.'],
}
type SliderId = 'rate' | 'keys' | 'ttl' | 'jitter' | 'lat' | 'cap' | 'beta' | 'speed'
const SLIDERS: { id: SliderId, label: string, min: number, max: number, step: number, fmt: (v: number) => string }[] = [
  { id: 'rate', label: 'Request rate', min: 20, max: 2000, step: 10, fmt: v => `${v} req/s` },
  { id: 'keys', label: 'Hot keys (Zipf)', min: 1, max: 48, step: 1, fmt: v => String(v) },
  { id: 'ttl', label: 'TTL', min: 2, max: 40, step: 1, fmt: v => `${v} s` },
  { id: 'jitter', label: 'TTL jitter', min: 0, max: 50, step: 5, fmt: v => `±${v}%` },
  { id: 'lat', label: 'Origin latency δ', min: 100, max: 3000, step: 50, fmt: v => `${v} ms` },
  { id: 'cap', label: 'Origin concurrency limit', min: 2, max: 60, step: 1, fmt: v => String(v) },
  { id: 'beta', label: 'XFetch β', min: 0.5, max: 4, step: 0.1, fmt: v => v.toFixed(1) },
  { id: 'speed', label: 'Sim speed', min: 1, max: 4, step: 1, fmt: v => `${v}×` },
]
const LANES = [{ id: 'A' }, { id: 'B' }]
const P = reactive({ rate: 300, keys: 12, ttl: 12, jitter: 0, lat: 800, cap: 12, beta: 1, speed: 1, strat: 'sf' as Strat })
const paused = ref(false)
const clock = ref('t = 0.0 s')
interface Cell { k: string, v: string, cls: string }
const metrics = ref<Record<string, Cell[]>>({ A: [], B: [] })
const cvs: Record<string, { lane?: HTMLCanvasElement, chart?: HTMLCanvasElement }> = { A: {}, B: {} }
function setCv(id: string, kind: 'lane' | 'chart', el: unknown) { cvs[id][kind] = (el as HTMLCanvasElement) || undefined }

let zipf: number[] = []
function buildZipf() { let s = 0; const w: number[] = []; for (let i = 0; i < P.keys; i++) { s += 1 / (i + 1); w.push(s) } zipf = w.map(x => x / s) }
function pickKey() { const r = Math.random(); let lo = 0, hi = zipf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (zipf[m] < r) lo = m + 1; else hi = m } return lo }
function poisson(l: number) {
  if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random() } while (p > L); return k - 1 }
  const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()); return Math.max(0, Math.round(l + Math.sqrt(l) * g))
}

let simT = 0, spikeUntil = -1, latP = 1, dotP = 1
const effRate = () => P.rate * (simT < spikeUntil ? 5 : 1)

interface KeyState { val: boolean, exp: number, delta: number, fetching: Fetch | null, leaseAt: number }
interface Fetch { k: number, start: number, end: number, fail: boolean, w: number[] }
interface Bucket { i: number, origin: number, req: number, hit: number, stale: number, err: number, inMax: number, waitMax: number, retry: number }
interface Dot { type: string, t0: number, y: number }

class Lane {
  strat: string; cv!: HTMLCanvasElement; ch!: HTMLCanvasElement
  keys: KeyState[] = []; inflight: Fetch[] = []; retries: { k: number, t0: number, next: number }[] = []
  buckets: Bucket[] = []; lats: number[] = []; waiting = 0; dots: Dot[] = []; errFlash = 0
  constructor(strat: string) { this.strat = strat; this.reset() }
  reset() {
    this.keys = Array.from({ length: P.keys }, () => ({ val: false, exp: 0, delta: P.lat / 1000, fetching: null, leaseAt: -1e9 }))
    this.inflight = []; this.retries = []; this.buckets = []; this.lats = []; this.waiting = 0; this.dots = []
  }
  bucket(t: number) {
    const i = Math.floor(t / 0.5); let b = this.buckets[this.buckets.length - 1]
    if (!b || b.i !== i) { b = { i, origin: 0, req: 0, hit: 0, stale: 0, err: 0, inMax: 0, waitMax: 0, retry: 0 }; this.buckets.push(b); if (this.buckets.length > 140) this.buckets.shift() }
    return b
  }
  rec(t: number, lat: number) { if (Math.random() < latP) this.lats.push(t, lat) }
  hit(t: number, b: Bucket) { b.hit++; this.rec(t, 0.002); return 'hit' }
  fetch(k: number, t: number, t0: number | null, shared: boolean, bg = false) {
    const b = this.bucket(t); const n = this.inflight.length + 1, cap = P.cap, base = P.lat / 1000
    const fail = n > cap * 3
    const dur = fail ? 0.06 : base * (1 + 1.5 * Math.max(0, (n - cap) / cap)) * (0.85 + 0.3 * Math.random())
    const f: Fetch = { k, start: t, end: t + dur, fail, w: t0 == null ? [] : [t0] }; this.inflight.push(f); b.origin++
    if (shared) this.keys[k].fetching = f
    if (bg) this.spawn('bg')
    return 'miss'
  }
  request(t: number, k: number) {
    const s = this.keys[k], b = this.bucket(t); b.req++; const fresh = s.val && t < s.exp
    switch (this.strat) {
      case 'naive': return fresh ? this.hit(t, b) : this.fetch(k, t, t, false)
      case 'sf': if (fresh) return this.hit(t, b); if (s.fetching) { s.fetching.w.push(t); return 'wait' } return this.fetch(k, t, t, true)
      case 'swr':
        if (fresh) return this.hit(t, b)
        if (s.val && t < s.exp + P.ttl * 5) { b.stale++; this.rec(t, 0.002); if (!s.fetching) this.fetch(k, t, null, true, true); return 'stale' }
        return this.fetch(k, t, t, false)
      case 'xf': if (s.val && (t - s.delta * P.beta * Math.log(Math.random() || 1e-12)) < s.exp) return this.hit(t, b); return this.fetch(k, t, t, false)
      default:
        if (fresh) return this.hit(t, b)
        if (!s.fetching && t - s.leaseAt >= LEASE) { s.leaseAt = t; return this.fetch(k, t, t, true) }
        this.retries.push({ k, t0: t, next: t + RETRY }); return 'wait'
    }
  }
  step(t: number) {
    const b = this.bucket(t)
    if (this.inflight.length) {
      const keep: Fetch[] = []
      for (const f of this.inflight) {
        if (f.end <= t) {
          const s = this.keys[f.k]; if (s && s.fetching === f) s.fetching = null
          if (f.fail) { b.err += f.w.length; this.errFlash = performance.now() }
          else if (s) { s.val = true; s.exp = f.end + P.ttl * (1 + P.jitter / 100 * (2 * Math.random() - 1)); s.delta = f.end - f.start; for (const t0 of f.w) this.rec(t, f.end - t0) }
        } else keep.push(f)
      }
      this.inflight = keep
    }
    if (this.retries.length) {
      const keep: typeof this.retries = []
      for (const r of this.retries) {
        if (r.next > t) { keep.push(r); continue }
        const s = this.keys[r.k]
        if (!s) continue
        if (s.val && t < s.exp) { b.hit++; this.rec(t, t - r.t0) }
        else if (t - r.t0 > GIVEUP) { b.err++ }
        else if (!s.fetching && t - s.leaseAt >= LEASE) { s.leaseAt = t; this.fetch(r.k, t, r.t0, true) }
        else { r.next = t + RETRY; b.retry++; keep.push(r) }
      }
      this.retries = keep
    }
    let w = this.retries.length; for (const f of this.inflight) w += f.w.length; this.waiting = w
    if (this.inflight.length > b.inMax) b.inMax = this.inflight.length; if (w > b.waitMax) b.waitMax = w
  }
  flush() { for (const s of this.keys) { s.val = false; s.exp = 0; s.leaseAt = -1e9 } }
  spawn(type: string) { if (this.dots.length > 260) return; this.dots.push({ type, t0: performance.now(), y: 0.12 + Math.random() * 0.76 }) }
  metrics() {
    const now = simT; const bs = this.buckets.slice(-20); const span = Math.max(0.5, Math.min(10, now))
    let o = 0, req = 0, st = 0, err = 0, pk = 0, rt = 0
    for (const b of bs) { o += b.origin; req += b.req; st += b.stale; err += b.err; rt += b.retry; if (b.inMax > pk) pk = b.inMax }
    let i = 0; const L = this.lats; while (i < L.length && L[i] < now - 10) i += 2; if (i) L.splice(0, i)
    const v: number[] = []; for (let j = 1; j < L.length; j += 2) v.push(L[j]); v.sort((a, b) => a - b)
    const p95 = v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.99))] : 0
    return { orate: o / span, peak: pk, p95, stale: req ? st / req : 0, err, retry: rt / span, waiting: this.waiting }
  }
}

let A: Lane, B: Lane, lanes: Lane[] = []

const fmtMs = (s: number) => (s < 1 ? Math.round(s * 1000) + ' ms' : s.toFixed(2) + ' s')
function renderMetrics() {
  lanes.forEach((L, idx) => {
    const m = L.metrics()
    metrics.value[idx === 0 ? 'A' : 'B'] = [
      { k: 'Origin calls/s', v: m.orate.toFixed(1), cls: m.orate > P.cap * 2 / (P.lat / 1000) ? 'bad' : '' },
      { k: 'Peak in-flight', v: m.peak + ' / ' + P.cap, cls: m.peak > P.cap * 3 ? 'bad' : m.peak > P.cap ? 'warn' : 'ok' },
      { k: 'p99 latency (served)', v: m.p95 ? fmtMs(m.p95) : '—', cls: m.p95 > 1.5 ? 'bad' : m.p95 > 0.3 ? 'warn' : 'ok' },
      { k: 'Errors (10 s)', v: String(m.err), cls: m.err ? 'bad' : 'ok' },
      { k: 'Stale served', v: (m.stale * 100).toFixed(1) + '%', cls: m.stale > 0 ? 'warn' : '' },
      { k: L.strat === 'lease' ? 'Retries/s' : 'Waiting now', v: L.strat === 'lease' ? Math.round(m.retry).toLocaleString('en') : m.waiting.toLocaleString('en'), cls: '' },
    ]
  })
  clock.value = 't = ' + simT.toFixed(1) + ' s' + (simT < spikeUntil ? ' · spike' : '') + (paused.value ? ' · paused' : '')
}

// ---- drawing: colors come from the site tokens, re-read when the theme changes ----
const C: Record<string, string> = {}
function readColors() {
  const cs = getComputedStyle(document.documentElement)
  const map: Record<string, string> = { bg: '--bg', surface: '--surface', sunk: '--sunk', ink: '--ink', muted: '--muted', line: '--line', accent: '--signal', hit: '--ok', stale: '--spark', miss: '--bad', wait: '--c-4' }
  for (const k of Object.keys(map)) C[k] = cs.getPropertyValue(map[k]).trim()
}
function fit(cv: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const d = window.devicePixelRatio || 1; const w = cv.clientWidth, h = cv.clientHeight
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d) }
  const g = cv.getContext('2d')!; g.setTransform(d, 0, 0, d, 0, 0); return [g, w, h]
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
function alpha(hex: string, a: number) { if (!hex || hex[0] !== '#') return hex; const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')' }

function drawLane(L: Lane) {
  const [g, w, h] = fit(L.cv); g.clearRect(0, 0, w, h)
  const cx = w * 0.08, kx = w * 0.36, kw = w * 0.26, ox = w * 0.78, ow = w * 0.17
  g.font = '500 14px "IBM Plex Mono", monospace'; g.fillStyle = C.muted; g.textBaseline = 'top'
  g.fillText('clients', 4, 4); g.fillText('cache', kx, 4); g.fillText('origin', ox, 4)
  for (let i = 0; i < 7; i++) { g.fillStyle = alpha(C.muted, 0.35); g.beginPath(); g.arc(cx, 30 + i * (h - 50) / 6, 4, 0, Math.PI * 2); g.fill() }
  const ky = 22, kh = h - 34; g.fillStyle = C.surface; rr(g, kx, ky, kw, kh, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke()
  const n = L.keys.length, cols = Math.max(1, Math.ceil(Math.sqrt(n * kw / kh))), rows = Math.ceil(n / cols)
  const pad = 8, cw = (kw - pad * 2) / cols, chh = Math.min((kh - pad * 2 - 16) / rows, cw)
  for (let i = 0; i < n; i++) {
    const s = L.keys[i]; const x = kx + pad + (i % cols) * cw, y = ky + pad + Math.floor(i / cols) * chh; const cwi = cw - 3, chi = chh - 3
    let fill = C.sunk
    if (s.val && simT < s.exp) { const rem = Math.max(0, Math.min(1, (s.exp - simT) / P.ttl)); fill = alpha(C.hit, 0.25 + 0.75 * rem) }
    else if (s.val) { fill = C.stale }
    g.fillStyle = fill; rr(g, x, y, cwi, chi, 3); g.fill()
    if (s.fetching) { g.strokeStyle = C.wait; g.lineWidth = 2; rr(g, x + 1, y + 1, cwi - 2, chi - 2, 3); g.stroke() }
  }
  g.fillStyle = L.waiting ? C.wait : C.muted; g.font = '500 14px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'
  g.fillText(L.waiting ? L.waiting.toLocaleString('en') + ' waiting' : 'no waiters', kx + pad, ky + kh - 5)
  const oy = 22, oh = h - 34; const flash = performance.now() - L.errFlash < 350
  g.fillStyle = C.surface; rr(g, ox, oy, ow, oh, 8); g.fill(); g.strokeStyle = flash ? C.miss : C.line; g.lineWidth = flash ? 2.5 : 1; g.stroke()
  const inf = L.inflight.length, mx = P.cap * 3, frac = Math.min(1, inf / mx)
  const mxp = ox + ow * 0.3, mw = ow * 0.4, mtop = oy + 18, mh = oh - 36
  g.fillStyle = C.sunk; g.fillRect(mxp, mtop, mw, mh)
  g.fillStyle = inf > P.cap * 2 ? C.miss : inf > P.cap ? C.stale : C.hit; g.fillRect(mxp, mtop + mh * (1 - frac), mw, mh * frac)
  const capY = mtop + mh * (1 - 1 / 3); g.strokeStyle = C.ink; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(mxp - 6, capY); g.lineTo(mxp + mw + 6, capY); g.stroke(); g.setLineDash([])
  g.fillStyle = C.ink; g.textBaseline = 'top'; g.textAlign = 'center'; g.fillText(String(inf), ox + ow / 2, oy + 4)
  g.fillStyle = C.muted; g.textBaseline = 'bottom'; g.fillText('limit ' + P.cap, ox + ow / 2, oy + oh - 4); g.textAlign = 'left'
  const now = performance.now(); const keep: Dot[] = []
  for (const d of L.dots) {
    const age = now - d.t0; const y = 22 + d.y * (h - 40); let x = 0, col: string, alive = true, a = 1
    if (d.type === 'hit' || d.type === 'stale') { const T = 700; if (age > T) { alive = false } else { const p = age / T; x = p < 0.5 ? cx + (kx - cx) * (p * 2) : kx - (kx - cx) * ((p - 0.5) * 2) } col = d.type === 'hit' ? C.hit : C.stale }
    else if (d.type === 'wait') { const T = 900; if (age > T) alive = false; else { const p = Math.min(1, age / 450); x = cx + (kx - 6 - cx) * p; a = age > 450 ? 1 - (age - 450) / 450 : 1 } col = C.wait }
    else if (d.type === 'miss') { const T = 900; if (age > T) alive = false; else { const p = age / T; x = cx + (ox - cx) * p } col = C.miss }
    else { const T = 600; if (age > T) alive = false; else { const p = age / T; x = kx + kw + (ox - kx - kw) * p } col = C.wait }
    if (!alive) continue
    keep.push(d); g.globalAlpha = Math.max(0, a); g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
  }
  L.dots = keep
}
function drawCharts() {
  let ymax = P.cap * 1.6; for (const L of lanes) for (const b of L.buckets) if (b.inMax > ymax) ymax = b.inMax; ymax = Math.ceil(ymax * 1.1)
  const cur = Math.floor(simT / 0.5)
  for (const L of lanes) {
    const [g, w, h] = fit(L.ch); g.clearRect(0, 0, w, h); const left = 34, top = 6, bot = h - 16, pw = w - left - 4, ph = bot - top
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(left, bot + .5); g.lineTo(w - 4, bot + .5); g.stroke()
    g.fillStyle = C.muted; g.font = '14px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle'
    g.fillText(String(ymax), left - 4, top + 4); g.fillText('0', left - 4, bot)
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('−60 s', left, bot + 2); g.textAlign = 'right'; g.fillText('now', w - 4, bot + 2); g.textAlign = 'left'
    const bw = pw / 120
    for (const b of L.buckets) {
      const age = cur - b.i; if (age < 0 || age >= 120) continue
      const x = left + pw - (age + 1) * bw; const bh = ph * Math.min(1, b.inMax / ymax)
      g.fillStyle = b.inMax > P.cap * 3 ? C.miss : b.inMax > P.cap ? C.stale : C.accent; g.fillRect(x + 0.5, bot - bh, Math.max(1, bw - 1), bh)
      if (b.err) { g.fillStyle = C.miss; g.fillRect(x + 0.5, top, Math.max(1, bw - 1), 3) }
    }
    const cy = bot - ph * (P.cap / ymax); g.strokeStyle = C.ink; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(left, cy); g.lineTo(w - 4, cy); g.stroke(); g.setLineDash([])
  }
}

function tick(dt: number) {
  const steps = Math.round(dt / DT); latP = Math.min(1, 500 / Math.max(1, effRate())); dotP = Math.min(1, 22 / Math.max(1, effRate()))
  for (let s = 0; s < steps; s++) {
    simT += DT; const n = poisson(effRate() * DT)
    for (let i = 0; i < n; i++) {
      const k = pickKey(); const show = Math.random() < dotP
      for (const L of lanes) {
        const r = L.request(simT, k)
        if (r === 'miss') { if (Math.random() < Math.min(1, 40 / Math.max(1, effRate() * 0.05))) L.spawn('miss') } else if (show) L.spawn(r)
      }
    }
    for (const L of lanes) L.step(simT)
  }
}

function resetAll() { buildZipf(); for (const L of lanes) L.reset() }
function setStrat(s: Strat) { P.strat = s; if (B) B.strat = s; resetAll(); simT = Math.ceil(simT) }
function setP(id: SliderId, e: Event) { P[id] = Number((e.target as HTMLInputElement).value); if (id === 'keys' && lanes.length) resetAll() }
function flush() { for (const L of lanes) L.flush() }
function spike() { spikeUntil = simT + 10 }
function togglePause() { paused.value = !paused.value; renderMetrics() }
function resetSim() { simT = 0; spikeUntil = -1; resetAll() }

let raf = 0, stopped = false
let mo: MutationObserver | undefined, io: IntersectionObserver | undefined
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
onMounted(() => {
  A = new Lane('naive'); B = new Lane(P.strat); lanes = [A, B]
  A.cv = cvs.A.lane!; A.ch = cvs.A.chart!; B.cv = cvs.B.lane!; B.ch = cvs.B.chart!
  readColors(); mq?.addEventListener('change', readColors)
  mo = new MutationObserver(readColors); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  buildZipf(); simT = 0
  tick(3); renderMetrics() // warm-start so the first frame already shows a working state
  let last = performance.now(), lastM = 0, visible = true
  io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }); io.observe(A.cv)
  const frame = (now: number) => {
    if (stopped) return
    const real = Math.min(0.05, (now - last) / 1000); last = now
    if (visible) {
      if (!paused.value) tick(real * P.speed)
      for (const L of lanes) drawLane(L)
      drawCharts()
      if (now - lastM > 250) { renderMetrics(); lastM = now }
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); mo?.disconnect(); io?.disconnect(); mq?.removeEventListener('change', readColors) })
</script>

<style scoped>
.intro { display: flex; flex-direction: column; gap: 18px; }
.cs-bench { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 18px; gap: 18px; display: flex; flex-direction: column; min-width: 0; }
.cs-stack { display: flex; flex-direction: column; gap: 8px; }
.cs-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px 22px; }
.ctl label { font-weight: 500; font-size: .9rem; color: var(--muted); }
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pills button, .pbtn { font: 500 .9rem var(--f-body); border: 1px solid var(--line); background: var(--bg); color: var(--ink); padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: border-color .15s, background-color .15s, color .15s; }
.pills button[aria-pressed="true"] { background: var(--signal); border-color: var(--signal); color: var(--surface); }
.pills button:hover, .pbtn:hover { border-color: var(--signal); }
.pbtn.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.actions .clock { margin-left: auto; }
.stratnote { font-size: .95rem; background: var(--sunk); border-radius: var(--r-md); padding: 10px 12px; max-width: none; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@container (max-width: 860px) { .lanes { grid-template-columns: 1fr; } }
.lane { border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; background: var(--bg); }
.lane h3 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.lane h3 small { font: 400 .875rem var(--f-mono); color: var(--muted); }
.cv-lane { height: 210px; }
.cv-chart { height: 84px; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.metric { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; min-width: 0; }
.metric .k { font-size: .875rem; color: var(--muted); letter-spacing: .04em; }
.metric .v { font-family: var(--f-mono); font-size: 1.05rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.metric.bad .v { color: var(--bad); } .metric.warn .v { color: var(--spark); } .metric.ok .v { color: var(--ok); }
.chartcap { font-size: .875rem; color: var(--muted); font-family: var(--f-mono); }
.dbody ol, .dbody ul { margin: 0; padding-left: 1.25em; display: flex; flex-direction: column; gap: 6px; }
details.answer { border-color: var(--signal); }
.map { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.map > div { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
</style>
