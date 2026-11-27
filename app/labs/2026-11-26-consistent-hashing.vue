<!-- sdl:title: Consistent Hashing -->
<!-- sdl:topic: Partitioning -->
<template>
  <div class="labdoc">
    <header class="hero">
      <div class="eyebrow">System Design Lab · 2026-11-26 · Partitioning</div>
      <h1>Consistent hashing, virtual nodes and bounded loads</h1>
      <p class="lede">How to spread keys over a changing set of cache or storage nodes so that adding a node moves about 1/N of the data instead of nearly all of it, and how to stop one popular key from melting the node that owns it.</p>
    </header>

    <section>
      <div class="eyebrow">The real-world problem</div>
      <h2>What real systems ran into</h2>
      <p><strong>Vimeo, 2016.</strong> Skyfire, Vimeo's video-packaging layer, serves almost a billion DASH and HLS requests a day. It used consistent hashing to route requests for a given video to the same servers so local caches stay warm. But popularity is skewed: every request for a viral video lands on the same few servers, which overload. During peaks each shared memcached server pushed about <strong>400–500 Mbit/s</strong> outbound (about <strong>8 Gbit/s</strong> total). Andrew Rodland implemented Google's <em>consistent hashing with bounded loads</em> in HAProxy (accepted in 1.7.0-dev5, stable in 1.7.0). Afterwards the memcached servers sat comfortably <strong>below 100 Mbit/s</strong> each, and Google reports cache bandwidth fell by <strong>almost a factor of 8</strong>.</p>
      <p><strong>Discord, 2017.</strong> Discord routes each guild to the node that owns it with a consistent hash ring, and every session looks up the node for each guild it belongs to (about 5 on average), with up to 500,000 sessions per Erlang VM. The ring was on the hot path: a restarting session server spent about <strong>30 s</strong> just on ring lookups. Moving the ring into ETS cut that to 17.5 s, and compiling it into a read-only module (FastGlobal) brought a lookup to about <strong>0.3 µs</strong> and the total to <strong>750 ms</strong>. Bursts of reconnects had also overloaded the single process that served the ring.</p>
      <p><strong>Amazon Dynamo, 2007.</strong> Dynamo's paper names the two flaws of the basic ring: random node positions give <em>non-uniform data and load distribution</em>, and the ring ignores node heterogeneity. Virtual nodes fix both. Its production measurements showed load imbalance up to 20% at low load and close to 10% at high load. With random tokens (strategy 1) bootstrapping a new node took almost a day; fixed equal-sized partitions (strategy 3) balanced best and cut per-node membership state by three orders of magnitude.</p>
      <div class="facts">
        <div class="fact"><span class="n">~8×</span><span>cache bandwidth drop at Vimeo after bounded loads</span></div>
        <div class="fact"><span class="n">450 → &lt;100</span><span>Mbit/s per memcached server at peak</span></div>
        <div class="fact"><span class="n">30 s → 0.75 s</span><span>Discord ring lookups per session-server restart</span></div>
        <div class="fact"><span class="n">10–20%</span><span>load imbalance measured in Dynamo</span></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">The concept</div>
      <h2>The concept</h2>
      <p><strong>Naive: <code>hash(k) mod N</code>.</strong> Balanced, stateless, and catastrophic on resize. Going from N to N+1 nodes changes the owner of about N/(N+1) of keys, so adding a 9th cache node misses about 89% of the cache at once. The whole working set refills from the origin, which for us means the suppliers.</p>
      <p><strong>Ring.</strong> Hash nodes and keys into the same 32-bit space and give each key to the first node clockwise. A membership change only moves keys in the arcs next to the node that changed, about 1/N of keys in expectation.</p>
      <p><strong>Virtual nodes.</strong> With one point per node, arc lengths vary a lot, so some nodes own several times the average. Putting V points per node smooths it: imbalance shrinks roughly with 1/√V. When a node dies, its load spreads across all survivors instead of falling on one neighbour. Weighting V per node handles mixed instance sizes.</p>
      <p><strong>Bounded loads (Mirrokni, Thorup, Zadimoghaddam).</strong> Even a perfect key split fails when traffic per key is skewed. Cap each node at <code>⌈c · average load⌉</code>. A key whose natural owner is full walks clockwise to the next node with spare capacity. Every node is guaranteed to stay ≤ c × average, and each insert or removal moves O(1/ε²) other keys, where c = 1+ε. Vimeo's write-up suggests c between 1.25 and 2.</p>
      <div class="tbl">
      <table>
        <thead><tr><th>Scheme</th><th>Keys moved on +1 node</th><th>Balance</th><th>Lookup state</th><th>Failure mode</th></tr></thead>
        <tbody>
          <tr><td><code>mod N</code></td><td>≈ N/(N+1)</td><td>Good by key count</td><td>None</td><td>Every resize is a cold-cache event</td></tr>
          <tr><td>Ring, 1 point/node</td><td>≈ 1/N</td><td>Poor: some nodes own several× the average</td><td>N points</td><td>Hot arcs; a dead node's load falls on one neighbour</td></tr>
          <tr><td>Ring + vnodes</td><td>≈ 1/N, taken from many peers</td><td>Good by key count</td><td>N·V points, O(log NV) lookup</td><td>Still blind to skewed traffic per key</td></tr>
          <tr><td>+ bounded loads</td><td>≈ 1/N plus O(1/ε²) cascade moves</td><td>≤ c × average, guaranteed</td><td>Needs live load per node</td><td>Spill reduces cache affinity; needs shared load view</td></tr>
          <tr><td>Jump hash</td><td>Optimal 1/(N+1)</td><td>Near perfect</td><td>None, about 5 lines of code</td><td>Buckets must be numbered 0..N−1, so you can't drop one from the middle</td></tr>
          <tr><td>Fixed slots (Dynamo strategy 3, Redis 16384 slots)</td><td>Move whole slots</td><td>Good, tunable</td><td>Slot → node table</td><td>Needs a rebalancer and slot migration</td></tr>
        </tbody>
      </table>
      </div>
    </section>

    <section id="lab">
      <div class="intro">
        <div class="eyebrow">Simulator</div>
        <h2>Resize the cluster and watch keys remap</h2>
        <p>1,200 conversation keys (<code>chat_0001…</code>) live on the ring. Add or kill nodes and compare how many keys move under <code>mod N</code> and under the ring. Switch traffic to <em>Zipf</em> to make a few conversations hot, then turn on bounded loads and watch the red capacity line hold.</p>
      </div>
      <div class="bench">
        <div class="controls">
          <div class="btns">
            <button type="button" class="lbtn primary" @click="addNode">+ Add node</button>
            <button type="button" class="lbtn" @click="killNode">Kill a node</button>
            <button type="button" class="lbtn" @click="resetAll">Reset</button>
          </div>
          <div class="ctl"><label for="ch-vn">Vnodes per node <output>{{ P.V }}</output></label><input id="ch-vn" :value="P.V" type="range" min="1" max="200" step="1" @input="onV"></div>
          <div class="ctl"><span class="lbl">Traffic</span>
            <div class="seg" role="group" aria-label="Traffic distribution">
              <button type="button" :aria-pressed="!P.zipf" @click="setZipf(false)">Uniform</button>
              <button type="button" :aria-pressed="P.zipf" @click="setZipf(true)">Zipf (hot chats)</button>
            </div>
          </div>
          <label class="toggle"><input v-model="P.bounded" type="checkbox" @change="refresh"> Bounded loads</label>
          <div class="ctl"><label for="ch-cf">Capacity factor c <output>{{ P.c.toFixed(2) }}</output></label><input id="ch-cf" :value="P.c" type="range" min="1.05" max="2" step="0.05" @input="onC"></div>
          <label class="toggle"><input v-model="P.anim" type="checkbox"> Animate requests</label>
        </div>
        <div class="scope">
          <div class="ringbox">
            <canvas ref="ringEl" width="920" height="920" role="img" aria-label="Hash ring showing virtual nodes and keys"></canvas>
            <div class="ring-caption"><div><strong>{{ view.capNodes }}</strong>{{ view.capV }}<br>{{ view.capMode }}</div></div>
          </div>
          <div class="legend" style="justify-content:center">
            <span v-for="n in view.legend" :key="n.id"><i class="sw" :style="{ background: n.color }"></i>{{ n.name }}</span>
          </div>
          <div class="scoreboard" aria-live="polite">
            <div v-for="s in view.scores" :key="s.k" :class="['score', { active: s.active }]"><span class="name">{{ s.name }}</span><span class="big">{{ s.move }}</span><span class="peakline">peak <span :class="s.lvl">{{ s.peak }}×</span> avg</span></div>
          </div>
          <p class="hint">Big number: keys that changed owner on the last add or kill. Peak: busiest node's load ÷ average.</p>
          <div class="log">{{ view.log }}</div>
          <div class="legend">
            <span><i class="sw" style="background:var(--muted);opacity:.6"></i>mod N</span>
            <span><i class="sw" style="background:var(--signal)"></i>ring</span>
            <span><i class="sw" style="background:var(--ok)"></i>bounded</span>
            <span><i class="sw" style="background:var(--bad)"></i>capacity c×avg</span>
          </div>
          <div class="bars">
            <div v-for="b in view.bars" :key="b.id" class="bar-row">
              <span><i class="sw" :style="{ background: b.color }"></i>{{ b.name }}</span>
              <div class="track"><i class="m" :style="{ width: b.m }"></i><i class="r" :style="{ width: b.r }"></i><i class="b" :style="{ width: b.b }"></i><span class="avgline" :style="{ left: b.avg }"></span><span v-if="b.cap" class="capline" :style="{ left: b.cap }"></span></div>
              <span class="val">{{ b.val }}×</span>
            </div>
          </div>
        </div>
      </div>
      <p class="hint">Try this: set vnodes to 1 and see the ring's peak jump far above mod N. Raise it to 100+ and the ring is balanced by key count, but with Zipf traffic it still has a hot node. Turn on bounded loads and the peak is capped at c. Kill a node and each scheme reports what it moved.</p>
    </section>

    <section id="solve">
      <div class="eyebrow">Solve it</div>
      <h2>Solve it: the chat cache during a big match</h2>
      <div class="scenario">
        <p>A chat app caches the latest messages of each conversation in 8 plain cache nodes (not a clustered cache, just separate instances behind the app), keyed by <code>conv:{conversationId}</code> and picked with <code>crc32(key) % 8</code>. The hit rate is 92%. During a big football final, autoscaling adds a 9th cache node and a 9th chat worker. Within a minute, database reads spike about 10×, the message database starts timing out, and chat p99 goes from 900 ms to 6 s. At the same time, one public watch-party room and a handful of popular group chats get 30% of all lookups, and the node that owns them hits its CPU limit.</p>
        <p class="q">Redesign key placement so that (a) scaling the cache tier doesn't cause a database storm, (b) hot conversations can't overload one node, and (c) messages stay ordered per conversation in the message log when you add partitions.</p>
      </div>
      <details><summary>Hint 1: Do the remap arithmetic</summary><div class="dbody"><p>Going from 8 to 9 nodes under mod N moves about 8/9 ≈ 89% of keys. Your effective hit rate collapses from 92% to around 10% instantly, and every miss is a database read.</p></div></details>
      <details><summary>Hint 2: Key count isn't load</summary><div class="dbody"><p>Vnodes balance <em>keys</em>. The hot-room problem is <em>request weight per key</em>. You need a load-aware rule (bounded loads), key replication for the very hottest keys, or both.</p></div></details>
      <details><summary>Hint 3: A partitioned log doesn't rehash for you</summary><div class="dbody"><p>Most partitioned logs pick a partition with <code>hash(key) % numPartitions</code>. Kafka's default partitioner is <code>murmur2(key) % numPartitions</code>, and its docs say adding partitions doesn't change the partitioning of existing data and that Kafka won't redistribute data automatically, so new messages for an existing conversation can land on a different partition than its earlier ones.</p></div></details>
      <details class="answer"><summary>Show model answer</summary><div class="dbody">
        <ul>
          <li><strong>Placement:</strong> replace <code>% N</code> with a ketama-style ring (100–200 vnodes per node, weighted by instance size) or move to a fixed slot scheme such as Redis Cluster's 16384 hash slots. Adding the 9th node now moves about 1/9 of keys, taken evenly from all 8 nodes. Better still, pre-split: run more, smaller logical shards than you need and move slots, not keys.</li>
          <li><strong>Warm-up:</strong> treat cache resizes as deploys. Add the node to the ring with low weight and ramp it up, or dual-read from old and new owners for one TTL window. Keep a stale-while-revalidate copy so a miss doesn't have to hit the database.</li>
          <li><strong>Database shield:</strong> coalesce in-flight misses per key (single-flight) and put a rate limit in front of the database reads, so a cold cache degrades latency instead of tipping the database over. This connects to the earlier labs on stampedes and rate limiting.</li>
          <li><strong>Hot rooms:</strong> route with bounded loads (c ≈ 1.25) at the routing layer, so overflow spills to the next ring node. For the top few keys, also replicate: write <code>conv:{id}#r0..r3</code> and read a random replica, or keep a 1–5 s in-process cache in each chat worker. Detect hot keys from request counters, not by guessing.</li>
          <li><strong>Message log:</strong> key messages by <code>conversationId</code>. Size partitions for peak at creation, since adding partitions breaks per-key ordering. If you must grow, create a new topic with more partitions, dual-write, drain the old topic, then cut consumers over. Consumers stay idempotent on <code>(conversationId, messageSeq)</code> so the overlap is harmless.</li>
          <li><strong>Trade-off to state:</strong> bounded loads and replicas reduce cache affinity, so hit rate dips slightly when spill happens. You accept that in exchange for a hard ceiling on any one node.</li>
        </ul>
      </div></details>
    </section>

    <section>
      <div class="eyebrow">In practice</div>
      <h2>In practice</h2>
      <div class="map">
        <div><h3>Application caches</h3><p>Many cache clients can use ketama-style consistent hashing instead of modulo, usually behind a single option. Turn it on. With a slot-based cluster, keep related keys together with hash tags, e.g. <code>conv:{123}:…</code>, so multi-key operations stay on one slot.</p></div>
        <div><h3>Routing in application code</h3><p>For sticky routing of connections or per-room workers, keep a sorted array of vnode hashes and binary-search it. Rebuild it only on membership change and publish it read-only, as Discord learned. Never compute the ring per request.</p></div>
        <div><h3>Sharded databases</h3><p>Use a hashed shard key for monotonically increasing fields (IDs, timestamps) to avoid a single hot chunk. Ranges then become broadcast queries, so for lookups prefer a compound key such as <code>{ tenantId: 1, roomId: "hashed" }</code>: equality targeting on the prefix, even spread on the hash.</p></div>
        <div><h3>Partitioned logs</h3><p>Partition count is part of your key → partition contract. Over-provision partitions at topic creation for ordered streams, key by the entity whose ordering matters, and treat repartitioning as a migration, not a config change.</p></div>
        <div><h3>Autoscaled fleets</h3><p>Autoscaling changes membership often. Any tier that keys state to instance identity (in-memory caches, sticky consumers) needs ring placement plus a warm-up ramp, or scale-out events will look like cache flushes.</p></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">Sources</div>
      <h2>Read the originals</h2>
      <ol class="sources">
        <li><a href="https://research.google/blog/consistent-hashing-with-bounded-loads/" target="_blank" rel="noopener">Consistent Hashing with Bounded Loads</a>, Google Research blog, Apr 2017 (Vimeo ~8× bandwidth result, Cloud Pub/Sub, O(1/ε²) moves)</li>
        <li><a href="https://arxiv.org/abs/1608.01350" target="_blank" rel="noopener">Mirrokni, Thorup, Zadimoghaddam: Consistent Hashing with Bounded Loads</a>, arXiv 1608.01350</li>
        <li><a href="https://medium.com/vimeo-engineering-blog/improving-load-balancing-with-a-new-consistent-hashing-algorithm-9f1bd75709ed" target="_blank" rel="noopener">Improving load balancing with a new consistent-hashing algorithm</a>, Vimeo Engineering (Skyfire, 400–500 Mbit/s → &lt;100 Mbit/s, HAProxy 1.7)</li>
        <li><a href="https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users" target="_blank" rel="noopener">How Discord Scaled Elixir to 5,000,000 Concurrent Users</a>, Discord Engineering (hash ring, FastGlobal 0.3 µs)</li>
        <li><a href="https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html" target="_blank" rel="noopener">Dynamo: Amazon's Highly Available Key-value Store</a>, SOSP 2007 (virtual nodes, partitioning strategies 1–3)</li>
        <li><a href="https://arxiv.org/abs/1406.2294" target="_blank" rel="noopener">Lamping, Veach: A Fast, Minimal Memory, Consistent Hash Algorithm</a> (jump hash), arXiv 1406.2294</li>
        <li><a href="https://kafka.apache.org/41/operations/basic-kafka-operations/" target="_blank" rel="noopener">Apache Kafka: Basic Kafka Operations</a> (adding partitions doesn't repartition existing data)</li>
        <li><a href="https://www.mongodb.com/docs/manual/core/hashed-sharding/" target="_blank" rel="noopener">MongoDB Manual: Hashed Sharding</a></li>
        <li><a href="https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/" target="_blank" rel="noopener">Redis Cluster specification</a> (16384 hash slots, hash tags)</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
// Consistent hashing lab: 1,200 keys on a 32-bit ring. The engine (hashing, ring build, mod N / ring /
// bounded-load placement) is plain code; Vue renders controls and numbers, the canvas draws the ring.
const K = 1200
const MAX_NODES = 12
const MOVE_MS = 2200

interface Node { id: number, name: string }
interface Key { id: string, pos: number, w: number }
interface Assign { pts: { pos: number, node: number }[], mod: number[], ring: number[], bnd: number[], lm: Map<number, number>, lr: Map<number, number>, lb: Map<number, number>, avg: number, cap: number }

function h32(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}
const keys: Key[] = []
for (let i = 0; i < K; i++) { const id = 'chat_' + String(i + 1).padStart(4, '0'); keys.push({ id, pos: h32(id), w: 1 }) }
// Zipf weights over a hash-shuffled rank, so the hot keys are spread around the ring.
const rankOrder = keys.map((_, i) => i).sort((a, b) => h32('rank' + a) - h32('rank' + b))
const zipfW: number[] = new Array(K)
{ let tot = 0; rankOrder.forEach((ki, r) => { const w = 1 / Math.pow(r + 1, 1.05); zipfW[ki] = w; tot += w }); for (let i = 0; i < K; i++) zipfW[i] = zipfW[i]! * K / tot }

const P = reactive({ V: 40, c: 1.25, zipf: true, bounded: false, anim: true })

// Six series colors from the site tokens; nodes 7..12 reuse them mixed toward the ink color.
const pal = ref<string[]>(['#4f46e5', '#d97706', '#15803d', '#9333ea', '#0e8f8a', '#be3a8f', '#8a8f9c', '#8a8f9c', '#8a8f9c', '#8a8f9c', '#8a8f9c', '#8a8f9c'])
const col = { line: '#ccc', ink: '#111', surface: '#fff', bad: '#c00' }
const nodeColor = (id: number) => pal.value[(id - 1) % 12]!
function mix(a: string, b: string, t: number) {
  const p = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); const n = m ? parseInt(m[1]!, 16) : 0x888888; return [n >> 16, (n >> 8) & 255, n & 255] as const }
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return '#' + c(r1, r2) + c(g1, g2) + c(b1, b2)
}
function readColors() {
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim()
  col.line = v('--line'); col.ink = v('--ink'); col.surface = v('--surface'); col.bad = v('--bad')
  const base = [1, 2, 3, 4, 5, 6].map(i => v('--c-' + i))
  pal.value = [...base, ...base.map(c => mix(c, col.ink, .38))]
  refresh()
}

let nodes: Node[] = []
let nextId = 1
let prevA: Assign | null = null
let A: Assign | null = null
let last: { dm: number, dr: number, db: number } | null = null
const moved = new Map<number, number>()
let logText = 'Ready. Add a node to see how many keys each scheme moves.'

function newNode(): Node { const id = nextId++; return { id, name: 'n' + id } }
function initNodes() { nodes = []; nextId = 1; for (let i = 0; i < 5; i++) nodes.push(newNode()) }
function weights() { for (let i = 0; i < K; i++) keys[i]!.w = P.zipf ? zipfW[i]! : 1 }

function buildRing() {
  const pts: { pos: number, node: number }[] = []
  for (const n of nodes) for (let v = 0; v < P.V; v++) pts.push({ pos: h32(n.name + '#' + v), node: n.id })
  pts.sort((a, b) => a.pos - b.pos)
  return pts
}
function firstIdx(pts: { pos: number }[], pos: number) {
  let lo = 0, hi = pts.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m]!.pos < pos) lo = m + 1; else hi = m }
  return lo === pts.length ? 0 : lo
}
function assign(): Assign {
  const pts = buildRing(), N = nodes.length, tot = keys.reduce((a, k) => a + k.w, 0)
  const mod = new Array<number>(K), ring = new Array<number>(K), bnd = new Array<number>(K)
  const lm = new Map<number, number>(), lr = new Map<number, number>(), lb = new Map<number, number>()
  nodes.forEach((n) => { lm.set(n.id, 0); lr.set(n.id, 0); lb.set(n.id, 0) })
  const cap = P.c * tot / N
  for (let i = 0; i < K; i++) {
    const k = keys[i]!
    const mid = nodes[k.pos % N]!.id; mod[i] = mid; lm.set(mid, lm.get(mid)! + k.w)
    const rid = pts[firstIdx(pts, k.pos)]!.node; ring[i] = rid; lr.set(rid, lr.get(rid)! + k.w)
  }
  // Bounded loads: keys are placed in a fixed order; a full owner passes the key clockwise to the next node with room.
  for (let i = 0; i < K; i++) {
    const k = keys[i]!, idx = firstIdx(pts, k.pos)
    let chosen: number | null = null
    for (let s = 0; s < pts.length; s++) {
      const nid = pts[(idx + s) % pts.length]!.node, l = lb.get(nid)!
      if (l + k.w <= cap || l === 0) { chosen = nid; break }
    }
    if (chosen === null) { let bl = Infinity; lb.forEach((l, id) => { if (l < bl) { bl = l; chosen = id } }) }
    bnd[i] = chosen!; lb.set(chosen!, lb.get(chosen!)! + k.w)
  }
  return { pts, mod, ring, bnd, lm, lr, lb, avg: tot / N, cap }
}
const peakOf = (m: Map<number, number>, avg: number) => { let x = 0; m.forEach((v) => { if (v > x) x = v }); return x / avg }
const diff = (a: number[], b: number[]) => { let c = 0; for (let i = 0; i < K; i++) if (a[i] !== b[i]) c++; return c }
const pct = (x: number) => (100 * x / K).toFixed(1) + '%'
const lvl = (p: number) => p <= 1.3 ? 'lvl-good' : p <= 1.8 ? 'lvl-warn' : 'lvl-bad'

function recompute(change: string | null) {
  weights(); prevA = A; A = assign()
  if (change && prevA) {
    const dm = diff(prevA.mod, A.mod), dr = diff(prevA.ring, A.ring), db = diff(prevA.bnd, A.bnd)
    last = { dm, dr, db }
    const act = P.bounded ? A.bnd : A.ring, pact = P.bounded ? prevA.bnd : prevA.ring, now = performance.now()
    for (let i = 0; i < K; i++) if (act[i] !== pact[i]) moved.set(i, now)
    logText = `${change}: mod N moved ${dm} keys (${pct(dm)}), ring moved ${dr} (${pct(dr)}), bounded moved ${db} (${pct(db)}).`
  }
  else if (change) { last = null; logText = change }
  refresh()
}

const view = ref({
  capNodes: '5 nodes', capV: '40 vnodes each', capMode: 'ring + vnodes', log: logText,
  legend: [] as { id: number, name: string, color: string }[],
  scores: [
    { k: 'm', name: 'mod N', move: '–', peak: '–', lvl: '', active: false },
    { k: 'r', name: 'ring + vnodes', move: '–', peak: '–', lvl: '', active: true },
    { k: 'b', name: 'bounded (c)', move: '–', peak: '–', lvl: '', active: false },
  ],
  bars: [] as { id: number, name: string, color: string, m: string, r: string, b: string, avg: string, cap: string, val: string }[],
})

function refresh() {
  const a = A
  if (!a) return
  const N = nodes.length
  const pm = peakOf(a.lm, a.avg), pr = peakOf(a.lr, a.avg), pb = peakOf(a.lb, a.avg)
  let mx = a.cap; [a.lm, a.lr, a.lb].forEach(m => m.forEach((v) => { if (v > mx) mx = v })); mx *= 1.05
  const f = (v: number) => (100 * v / mx).toFixed(1) + '%'
  const active = P.bounded ? a.lb : a.lr
  view.value = {
    capNodes: N + ' node' + (N === 1 ? '' : 's'), capV: P.V + ' vnode' + (P.V === 1 ? '' : 's') + ' each',
    capMode: P.bounded ? 'bounded loads, c = ' + P.c.toFixed(2) : 'ring + vnodes', log: logText,
    legend: nodes.map(n => ({ id: n.id, name: n.name, color: nodeColor(n.id) })),
    scores: [
      { k: 'm', name: 'mod N', move: last ? pct(last.dm) : '–', peak: pm.toFixed(2), lvl: lvl(pm), active: false },
      { k: 'r', name: 'ring + vnodes', move: last ? pct(last.dr) : '–', peak: pr.toFixed(2), lvl: lvl(pr), active: !P.bounded },
      { k: 'b', name: 'bounded (c)', move: last ? pct(last.db) : '–', peak: pb.toFixed(2), lvl: lvl(pb), active: P.bounded },
    ],
    bars: nodes.map(n => ({
      id: n.id, name: n.name, color: nodeColor(n.id),
      m: f(a.lm.get(n.id)!), r: f(a.lr.get(n.id)!), b: f(a.lb.get(n.id)!), avg: f(a.avg), cap: P.bounded ? f(a.cap) : '',
      val: (active.get(n.id)! / a.avg).toFixed(2),
    })),
  }
}

function addNode() {
  if (nodes.length >= MAX_NODES) { logText = '12 nodes is the lab maximum.'; refresh(); return }
  const n = newNode(); nodes.push(n); recompute('Added ' + n.name)
}
function killNode() {
  if (nodes.length <= 2) { logText = 'Keep at least 2 nodes.'; refresh(); return }
  const n = nodes.splice(Math.floor(nodes.length * 0.4), 1)[0]!
  recompute('Killed ' + n.name + ' (from the middle of the list)')
}
function resetAll() { P.V = 40; P.c = 1.25; P.bounded = false; A = null; prevA = null; last = null; moved.clear(); initNodes(); recompute('Reset to 5 nodes.') }
function onV(e: Event) { P.V = Number((e.target as HTMLInputElement).value); last = null; A = null; recompute(null) }
function onC(e: Event) { P.c = Number((e.target as HTMLInputElement).value); A = null; recompute(null) }
function setZipf(z: boolean) { P.zipf = z; A = null; last = null; recompute(null) }

// Canvas
const ringEl = ref<HTMLCanvasElement>()
const ang = (pos: number) => pos / 4294967296 * Math.PI * 2 - Math.PI / 2
const parts: { i: number, t0: number, c: string }[] = []
let lastEmit = 0
let cum: { z: boolean, arr: number[], t: number } | null = null
function pickKey() {
  if (!cum || cum.z !== P.zipf) { let a = 0; const arr = keys.map(k => a += k.w); cum = { z: P.zipf, arr, t: a } }
  const r = Math.random() * cum.t
  let lo = 0, hi = K - 1
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum.arr[m]! < r) lo = m + 1; else hi = m }
  return lo
}
function draw(ctx: CanvasRenderingContext2D, W: number, t: number) {
  const a = A
  if (!a) return
  const C = W / 2, R = W * 0.40
  ctx.clearRect(0, 0, W, W)
  ctx.lineWidth = 3; ctx.strokeStyle = col.line; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke()
  const pts = a.pts
  // Outer band: who owns each arc.
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, prev = pts[(i - 1 + pts.length) % pts.length]!
    let a0 = ang(prev.pos), a1 = ang(p.pos)
    if (pts.length === 1) { a0 = -Math.PI / 2; a1 = a0 + Math.PI * 2 } else if (a1 <= a0) a1 += Math.PI * 2
    ctx.strokeStyle = nodeColor(p.node); ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(C, C, R + 16, a0, a1); ctx.stroke()
  }
  if (pts.length <= 600) {
    ctx.globalAlpha = .55; ctx.strokeStyle = col.ink; ctx.lineWidth = 2
    for (const p of pts) {
      const an = ang(p.pos); ctx.beginPath()
      ctx.moveTo(C + Math.cos(an) * (R + 6), C + Math.sin(an) * (R + 6)); ctx.lineTo(C + Math.cos(an) * (R + 26), C + Math.sin(an) * (R + 26)); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  const act = P.bounded ? a.bnd : a.ring
  for (let i = 0; i < K; i++) {
    const k = keys[i]!, an = ang(k.pos), hot = k.w > 3, rr = R - 14 - (i % 4) * 9
    const x = C + Math.cos(an) * rr, y = C + Math.sin(an) * rr, mt = moved.get(i), fresh = mt !== undefined && t - mt < MOVE_MS
    ctx.fillStyle = nodeColor(act[i]!); ctx.beginPath(); ctx.arc(x, y, hot ? 7 : (fresh ? 6 : 3.2), 0, Math.PI * 2); ctx.fill()
    if (fresh) { ctx.strokeStyle = col.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke() }
    if (P.bounded && act[i] !== a.ring[i]) { ctx.globalAlpha = .6; ctx.strokeStyle = col.bad; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, hot ? 9.5 : 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1 }
  }
  for (const [i, mt] of moved) if (t - mt > MOVE_MS) moved.delete(i)
  if (P.anim && t - lastEmit > 40) { lastEmit = t; for (let j = 0; j < 3; j++) { const i = pickKey(); parts.push({ i, t0: t, c: nodeColor(act[i]!) }) } }
  for (let j = parts.length - 1; j >= 0; j--) {
    const p = parts[j]!, u = (t - p.t0) / 650
    if (u >= 1) { parts.splice(j, 1); continue }
    const an = ang(keys[p.i]!.pos), rr = R * 0.2 + (R - 30 - R * 0.2) * u
    ctx.globalAlpha = 1 - u * .6; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(C + Math.cos(an) * rr, C + Math.sin(an) * rr, 4, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = col.surface; ctx.beginPath(); ctx.arc(C, C, R * 0.2, 0, Math.PI * 2); ctx.fill()
}

let raf = 0, stopped = false
let io: IntersectionObserver | undefined, mo: MutationObserver | undefined
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) P.anim = false
  initNodes(); readColors(); recompute(null)
  mq?.addEventListener('change', readColors)
  mo = new MutationObserver(readColors); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const cv = ringEl.value!, ctx = cv.getContext('2d')!
  let visible = true
  io = new IntersectionObserver(([e]) => { visible = e!.isIntersecting }); io.observe(cv)
  const frame = (t: number) => { if (stopped) return; if (visible) draw(ctx, cv.width, t); raf = requestAnimationFrame(frame) }
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); io?.disconnect(); mo?.disconnect(); mq?.removeEventListener('change', readColors) })
</script>

<style scoped>
.intro { display: flex; flex-direction: column; gap: 14px; }
.ctl label { font-weight: 600; }
.toggle { display: flex; gap: 8px; align-items: center; font-size: .9rem; font-weight: 600; cursor: pointer; }
.toggle input { accent-color: var(--signal); width: 16px; height: 16px; }
.ringbox { position: relative; width: 100%; max-width: 460px; aspect-ratio: 1 / 1; margin: 0 auto; }
.ringbox canvas { width: 100%; height: 100%; }
.ring-caption { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; text-align: center; }
.ring-caption div { font-family: var(--f-mono); font-size: .875rem; color: var(--muted); line-height: 1.4; }
.ring-caption strong { display: block; font-family: var(--f-display); font-size: 1.4rem; color: var(--ink); }
.scoreboard { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.score { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 10px; display: grid; gap: 2px; min-width: 0; background: var(--bg); }
.score .name { font-size: .875rem; color: var(--muted); font-family: var(--f-mono); }
.score .big { font-family: var(--f-mono); font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.score .peakline { font-size: .875rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.score.active { border-color: var(--signal); box-shadow: inset 0 0 0 1px var(--signal); }
.lvl-good { color: var(--ok); } .lvl-warn { color: var(--spark); } .lvl-bad { color: var(--bad); }
.log { font-family: var(--f-mono); font-size: .875rem; color: var(--muted); background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; min-height: 2.6em; }
.bars { display: grid; gap: 6px; }
.bar-row { display: grid; grid-template-columns: 3.6rem 1fr 3.4rem; gap: 8px; align-items: center; font-size: .875rem; font-family: var(--f-mono); }
.bar-row .val { text-align: right; font-variant-numeric: tabular-nums; }
.track { position: relative; height: 30px; background: var(--sunk); border-radius: 5px; overflow: hidden; display: grid; grid-template-rows: repeat(3, 1fr); gap: 1px; }
.track i { display: block; height: 100%; border-radius: 0 3px 3px 0; }
.track i.m { background: var(--muted); opacity: .55; }
.track i.r { background: var(--signal); opacity: .65; }
.track i.b { background: var(--ok); }
.capline { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed var(--bad); }
.avgline { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid var(--ink); opacity: .45; }
.dbody ol, .dbody ul { margin: 0; padding-left: 1.25em; display: flex; flex-direction: column; gap: 6px; }
details.answer { border-color: var(--signal); }
.map { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.map > div { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.map p { font-size: .95rem; }
</style>
