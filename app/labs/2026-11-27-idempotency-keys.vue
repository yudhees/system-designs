<!-- sdl:title: Idempotency Keys -->
<!-- sdl:topic: Idempotency -->
<template>
  <div class="labdoc">
    <header class="hero">
      <div class="eyebrow">System Design Lab · 2026-11-27 · Idempotency</div>
      <h1>Retry without paying twice</h1>
      <p class="hook">Your API charged the shopper's card. The response died on the way back. The app retries. Did they just pay twice?</p>
      <div class="tldr">
        <b class="tag">TL;DR</b>
        <p>Networks lose responses, so clients must retry. Retrying is only safe if the server can tell "this is the same request again" from "this is a new request".</p>
        <p>The client sends a unique <b>idempotency key</b> with each operation. The server claims the key and the work <b>atomically</b>, saves the result, and replays that result for every retry.</p>
      </div>
    </header>

    <section>
      <div class="eyebrow">The real-world problem</div>
      <h2>Airbnb's payments split into services, and retries got dangerous</h2>
      <div class="story">
        <div class="beat"><span class="lbl">What happened</span><p>Airbnb was moving payments from a monolith to a service-oriented architecture (SOA). Every payment now crossed several network hops, and each hop could time out.</p></div>
        <div class="beat"><span class="lbl">What broke</span><p>A timed-out call is ambiguous. The charge may or may not have happened. Retrying blindly risks a double payment, and not retrying risks a lost one. Airbnb said they "couldn't compromise on data consistency".</p></div>
        <div class="beat"><span class="lbl">What they changed</span><p>They built <b>Orpheus</b>, one shared idempotency library. Every request runs in three phases: <b>Pre-RPC</b> (record the request in the DB), <b>RPC</b> (the network call only), <b>Post-RPC</b> (record the response). There is no network call inside a DB phase and no DB work inside the RPC phase.</p></div>
        <div class="beat"><span class="lbl">What improved</span><p>Airbnb reported <b>five nines in consistency</b> for payments, <b>while annual payment volume doubled</b>.</p></div>
      </div>
      <div class="callout c-num"><span class="tag">Real numbers · Stripe API v1</span>
        <p>Keys are up to <b>255 characters</b>. Stripe saves the status code and body of the first request, <b>including 500 errors</b>, and replays it. Keys can be pruned once they are <b>at least 24 hours old</b>. After that, the same key creates a new request.</p></div>
    </section>

    <section>
      <div class="eyebrow">The concept</div>
      <h2>A cloakroom ticket for your request</h2>
      <div class="analogy">
        <div class="tile"><span class="t">Without a ticket</span><p>You hand over your coat. The attendant turns away, and you aren't sure they took it, so you hand over a second coat. Now two coats are hanging under your name.</p></div>
        <div class="tile"><span class="t">With a ticket</span><p>You write ticket <code>#A7</code> first. If you are unsure, ask again with <code>#A7</code>. The attendant says "#A7 is already hanging" and hands you the same receipt.</p></div>
      </div>
      <ul>
        <li><b>Idempotent</b>: doing it once or ten times leaves the same state. <code>GET</code> and <code>DELETE</code> already behave this way. <code>POST /orders</code> does not.</li>
        <li><b>Idempotency key</b>: a random ID the <i>client</i> creates once per intent (Stripe suggests a V4 UUID) and resends unchanged on every retry.</li>
        <li><b>Claim</b>: the server's atomic "insert this key or tell me it exists", usually a unique index.</li>
      </ul>

      <h3>The three ways a call fails (Stripe's list)</h3>
      <div class="flow" role="img" aria-label="Three failure points: before reaching the server, during processing, after completion when the response is lost">
      <svg viewBox="0 0 640 150">
        <rect x="10" y="45" width="90" height="50" rx="8" fill="var(--sunk)" stroke="var(--line)"/>
        <text x="55" y="75" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-mono)" font-size="14">client</text>
        <rect x="270" y="45" width="110" height="50" rx="8" fill="var(--sunk)" stroke="var(--line)"/>
        <text x="325" y="75" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-mono)" font-size="14">server</text>
        <rect x="540" y="45" width="90" height="50" rx="8" fill="var(--sunk)" stroke="var(--line)"/>
        <text x="585" y="75" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-mono)" font-size="14">payments</text>
        <line x1="100" y1="60" x2="270" y2="60" stroke="var(--signal)" stroke-width="2"/>
        <line x1="380" y1="70" x2="540" y2="70" stroke="var(--signal)" stroke-width="2"/>
        <line x1="270" y1="82" x2="100" y2="82" stroke="var(--bad)" stroke-width="2" stroke-dasharray="5 4"/>
        <text x="185" y="34" text-anchor="middle" fill="var(--ok)" style="font-family:var(--f-body)" font-size="14">① before connect: safe to retry</text>
        <text x="460" y="34" text-anchor="middle" fill="var(--spark)" style="font-family:var(--f-body)" font-size="14">② mid-processing: work in limbo</text>
        <text x="185" y="118" text-anchor="middle" fill="var(--bad)" style="font-family:var(--f-body)" font-size="14">③ after completion: response lost</text>
        <text x="185" y="136" text-anchor="middle" fill="var(--muted)" style="font-family:var(--f-body)" font-size="14">client can't tell ③ from ①</text>
      </svg></div>

      <div class="callout c-key"><span class="tag">Key idea</span>
        <p>Recording the key and doing the work must succeed or fail <b>together</b>. AWS says this must be an ACID operation. Otherwise you get a key with no order, or an order with no key.</p></div>

      <div class="tbl"><table>
        <thead><tr><th>Design</th><th>Lost response</th><th>Double-tap / parallel retry</th><th>Crash mid-request</th></tr></thead>
        <tbody>
          <tr><td><b>Naive retry</b><br><small>no key</small></td><td class="t-bad">Charges again</td><td class="t-bad">Charges twice</td><td class="t-bad">Unknown state</td></tr>
          <tr><td><b>Key, check-then-insert</b><br><small>SELECT, do the work, INSERT the key at the end</small></td><td class="t-good">Replays</td><td class="t-bad">Both pass the check, so it charges twice</td><td class="t-meh">Work done, key missing</td></tr>
          <tr><td><b>Key, atomic claim + stored response</b><br><small>unique insert first, replay the saved result</small></td><td class="t-good">Replays</td><td class="t-good">Second request gets 409</td><td class="t-meh">Needs lease expiry + recovery</td></tr>
        </tbody>
      </table></div>

      <div class="callout c-gotcha"><span class="tag">Gotchas</span>
        <ul>
          <li><b>Same key, different body.</b> AWS returns a parameter-mismatch validation error. Brandur's Postgres design returns <code>409</code>. Never replay a response for a different request.</li>
          <li><b>A stuck "in progress" key.</b> If the server dies mid-request, the key stays locked. Orpheus gives each lease an expiry, so a retry is allowed only after the lease runs out.</li>
          <li><b>Replica lag.</b> Orpheus always reads idempotency rows from the <b>primary</b>. A replica may not have the first response yet.</li>
          <li><b>Downstream calls.</b> A charge at a payment provider or a call to a partner API is a "foreign state mutation" that you can't roll back. Give it its own derived key.</li>
        </ul></div>
    </section>

    <section id="lab">
      <div class="intro">
        <div class="eyebrow">Interactive lab</div>
        <h2>Break the checkout API</h2>
        <p>Send the same orders through both APIs, drop responses, and watch which ledger fills with red duplicate charges.</p>
      </div>
      <div class="bench">
        <div class="controls">
          <div class="ctl"><label for="id-loss">Responses lost <output>{{ cfg.loss }}%</output></label><input id="id-loss" v-model.number="cfg.loss" type="range" min="0" max="60" step="5"><small>The server finishes, but the reply never arrives (failure ③).</small></div>
          <div class="ctl"><label for="id-retries">Max client retries <output>{{ cfg.retries }}</output></label><input id="id-retries" v-model.number="cfg.retries" type="range" min="0" max="5" step="1"><small>Exponential backoff with jitter, same seed for both lanes.</small></div>
          <div class="ctl"><label class="toggle"><input v-model="cfg.dbl" type="checkbox"> Shopper double-taps "Pay"</label><small>Each order fires two requests 0.13 s apart, carrying the same key.</small></div>
          <div class="ctl"><label class="toggle"><input v-model="cfg.atomic" type="checkbox"> Atomic key claim (right lane)</label><small>Off = SELECT first, INSERT the key after the work.</small></div>
          <div class="btns">
            <button type="button" class="lbtn primary" @click="book">Place 1 order</button>
            <button type="button" class="lbtn" @click="burst">Burst of 10</button>
            <button type="button" class="lbtn" :aria-pressed="auto" @click="toggleAuto">Steady traffic: {{ auto ? 'on' : 'off' }}</button>
            <button type="button" class="lbtn" @click="resetAll">Reset</button>
          </div>
        </div>
        <div class="scope">
          <div class="legend">
            <span><i class="dot" style="background:var(--signal)"></i>request</span>
            <span><i class="dot" style="background:var(--ok)"></i>fresh response</span>
            <span><i class="dot" style="background:var(--c-4)"></i>replayed response</span>
            <span><i class="dot" style="background:var(--spark)"></i>409 in progress</span>
            <span><i class="dot" style="background:var(--bad)"></i>lost / duplicate</span>
          </div>
          <div class="lanes">
            <div class="lane">
              <div class="lane-head"><h3>Naive <code>POST /orders</code></h3><span class="pill bad">no key</span></div>
              <canvas ref="cvNaive" role="img" aria-label="Animation of requests to the naive API"></canvas>
              <div class="stats"><div v-for="s in views.naive.stats" :key="s.k" :class="['stat', { alert: s.alert }]"><span class="v">{{ s.v }}</span><span class="k">{{ s.k }}</span></div></div>
              <p class="money">Overcharged: <b>{{ views.naive.over }}</b> at an example rate of ₹6,500/night</p>
              <div class="ledger" aria-label="Payment ledger"><span v-for="(c, i) in views.naive.ledger" :key="i + c.t" :class="['chip', { dup: c.dup }]">{{ c.t }}</span></div>
            </div>
            <div class="lane">
              <div class="lane-head"><h3>With <code>Idempotency-Key</code></h3><span :class="['pill', keyPill.cls]">{{ keyPill.text }}</span></div>
              <canvas ref="cvKey" role="img" aria-label="Animation of requests to the idempotent API"></canvas>
              <div class="stats"><div v-for="s in views.key.stats" :key="s.k" :class="['stat', { alert: s.alert }]"><span class="v">{{ s.v }}</span><span class="k">{{ s.k }}</span></div></div>
              <p class="money">Overcharged: <b>{{ views.key.over }}</b> at an example rate of ₹6,500/night</p>
              <div class="ledger" aria-label="Payment ledger"><span v-for="(c, i) in views.key.ledger" :key="i + c.t" :class="['chip', { dup: c.dup }]">{{ c.t }}</span></div>
            </div>
          </div>
          <div class="try">
            <h3>Try this</h3>
            <ol>
              <li>Leave losses at 25% and hit <b>Burst of 10</b>. The left ledger turns red. The right lane serves purple <b>replays</b> instead.</li>
              <li>Turn on <b>double-tap</b>, then switch <b>Atomic key claim</b> off and burst again. Duplicates appear on the right too: both taps read "no key yet" before either one saves it. The key alone isn't the fix. The atomic claim is.</li>
              <li>Turn double-tap off and set <b>Max retries to 0</b>. Duplicates vanish on the left, but "charged, shopper saw error" climbs. You can't avoid retries. You can only make them safe.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>

    <section id="solve">
      <div class="eyebrow">Solve it</div>
      <h2>One order, four ways to duplicate it</h2>
      <div class="scenario">
        <p><b>Scenario.</b> A shopper pays for an order in your mobile app. Your API (1) charges the card with the payment provider, (2) asks a partner's fulfilment API to create the shipment, and (3) publishes <code>order.confirmed</code> to a message queue for emails and invoices.</p>
        <p>The fulfilment API has <b>no idempotency support</b> and sometimes times out after it has already created the shipment. The mobile app retries on timeouts. Servers get stopped during deploys.</p>
        <p><b>Design it so that no shopper is charged twice, no shipment is created twice, and no confirmation email goes out twice.</b></p>
      </div>
      <details><summary>Hint 1: where does the key come from?</summary><div class="dbody"><p>Generate it on the device when the checkout screen opens, not per HTTP attempt. A double-tap and a retry must carry the same key.</p></div></details>
      <details><summary>Hint 2: the partner can't dedupe for you</summary><div class="dbody"><p>Send the partner your own unique reference. After a timeout, look the shipment up before you retry.</p></div></details>
      <details><summary>Hint 3: think in phases</summary><div class="dbody"><p>Each external call is its own step. Save a recovery point after every one, so a restarted server knows where to resume.</p></div></details>
      <details class="answer"><summary>Reveal the model answer</summary><div class="dbody">
        <ul>
          <li><b>Client</b>: UUID v4 per checkout, sent as <code>Idempotency-Key</code>. Retry with exponential backoff + jitter.</li>
          <li><b>Claim</b>: insert <code>{userId, key, requestHash, status: started, lockedUntil}</code> under a unique index on <code>(userId, key)</code>, in the same transaction that creates the pending order.</li>
          <li><b>Existing key</b>: finished with the same hash → replay the stored code and body. Lease still active → <code>409</code> + <code>Retry-After</code>. Different hash → reject as a mismatch.</li>
          <li><b>Payment charge</b>: pass a derived key such as <code>order-{id}-charge</code>, so the provider dedupes your own retries. Save <code>recovery_point = charged</code>.</li>
          <li><b>Fulfilment partner</b>: send <code>clientRef = order-{id}</code>. On timeout, mark the order <i>unknown</i>, then look the shipment up by reference before creating it again. Never retry blindly.</li>
          <li><b>Events</b>: write <code>order.confirmed</code> to an outbox in the final transaction. The email consumer dedupes on event ID with a unique index, because redelivery will happen.</li>
          <li><b>Recovery</b>: a completer job picks up keys whose lease expired mid-flow and resumes from <code>recovery_point</code>. A reaper deletes keys after ~24–72 h.</li>
          <li><b>Reads</b>: read key rows from the primary, never a lagging replica.</li>
        </ul></div></details>
    </section>

    <section>
      <div class="eyebrow">In practice</div>
      <h2>Where this lives in real code</h2>
      <div class="prac">
        <div class="prow"><b>Web frameworks</b><p>Write one idempotency middleware that claims the key inside a database transaction, stores the response after the handler runs, and replays it on a repeat. A cache lock alone can expire mid-request, so the stored row is the real guard.</p></div>
        <div class="prow"><b>Any language</b><p>The same middleware works in every stack. Insert the key row and treat a duplicate-key error as "this key already exists", then branch on its status.</p></div>
        <div class="prow"><b>Databases</b><p>A unique compound index on <code>(user, key)</code> is the atomic claim. A scheduled cleanup or expiry index is the reaper. Read key rows from the primary.</p></div>
        <div class="prow"><b>Queues and logs</b><p>Producer idempotence only stops duplicate writes from producer retries. Consumers still see redelivered messages after rebalances, so keep a processed-event-ID table in the consumer.</p></div>
        <div class="prow"><b>Deploys and autoscaling</b><p>Servers stop during deploys and scale-in, so any request can die halfway. Lease expiry plus a scheduled completer job turns "stuck" into "resumed".</p></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">Recap</div>
      <div class="recap">
        <h2>Remember this</h2>
        <ul>
          <li>A timeout means "unknown", not "failed". Retries are mandatory, so make them safe.</li>
          <li>The client creates the key once per <b>intent</b> and resends it unchanged on every retry.</li>
          <li>Claim the key <b>atomically</b> with the work, then store and replay the response, errors included.</li>
          <li>External calls get derived keys or lookup-by-reference. Expire stuck leases and resume from recovery points.</li>
        </ul>
      </div>
    </section>

    <section>
      <div class="eyebrow">Sources</div>
      <h2>Read the originals</h2>
      <ol class="sources">
        <li><a href="https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb" target="_blank" rel="noopener">Avoiding Double Payments in a Distributed Payments System</a>: Airbnb Engineering, Jon Chew &amp; Ninad Khisti, 2019</li>
        <li><a href="https://docs.stripe.com/api/idempotent_requests" target="_blank" rel="noopener">Idempotent requests</a>: Stripe API reference</li>
        <li><a href="https://stripe.com/blog/idempotency" target="_blank" rel="noopener">Designing robust and predictable APIs with idempotency</a>: Stripe blog, Brandur Leach, 2017</li>
        <li><a href="https://builder.aws.com/content/3Ev0BENTyBr0XxzRk5FDZzgNYos/making-retries-safe-with-idempotent-apis" target="_blank" rel="noopener">Making retries safe with idempotent APIs</a>: Amazon Builders' Library</li>
        <li><a href="https://brandur.org/idempotency-keys" target="_blank" rel="noopener">Implementing Stripe-like Idempotency Keys in Postgres</a>: Brandur Leach</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
// Idempotency keys lab: the same orders go through a naive API and a keyed API, with lost responses,
// retries and double-taps. The engine is plain code stepped by a clock; Vue renders the controls and
// numbers, the canvases animate packets. Both lanes use the same random seed, so they see the same losses.
const PRICE = 6500 // example nightly rate, simulation only
const T = { travel: 650, proc: 450, replay: 120, conflict: 80, timeout: 2200, backoff: 350 }
const cfg = reactive({ loss: 25, retries: 3, dbl: false, atomic: true })
const auto = ref(false)

type Kind = 'req' | 'ok' | 'replay' | '409'
interface Packet { kind: Kind, t0: number, t1: number, retry?: boolean, lost?: boolean }
interface Intent { done: boolean, gaveUp: number, chains: number, failed: boolean }
interface Stat { k: string, v: number, alert: boolean }
interface LaneView { stats: Stat[], over: string, ledger: { t: string, dup: boolean }[] }
interface Cols { ink: string, muted: string, line: string, sunk: string, surface: string, accent: string, ok: string, dup: string, warn: string, replay: string, fb: string, fm: string }

let seed = 7, clock = 0, nextIntent = 1, autoAcc = 0
const noCols: Cols = { ink: '#111', muted: '#666', line: '#ccc', sunk: '#eee', surface: '#fff', accent: '#44f', ok: '#2a7', dup: '#c33', warn: '#c80', replay: '#93c', fb: 'system-ui, sans-serif', fm: 'monospace' }

function rnd(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519 + seed * 3266489917) | 0
  h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const blank = (): LaneView => ({ stats: statRows({ requested: 0, charged: 0, dup: 0, replays: 0, conflicts: 0, errCharged: 0 }), over: '₹0', ledger: [] })
function statRows(s: Lane['s']): Stat[] {
  return [
    { k: 'Orders requested', v: s.requested, alert: false }, { k: 'Orders charged', v: s.charged, alert: false },
    { k: 'Duplicate charges', v: s.dup, alert: s.dup > 0 }, { k: 'Replays served', v: s.replays, alert: false },
    { k: '409 conflicts', v: s.conflicts, alert: false }, { k: 'Charged, shopper saw error', v: s.errCharged, alert: s.errCharged > 0 },
  ]
}
const views = reactive<{ naive: LaneView, key: LaneView }>({ naive: blank(), key: blank() })

class Lane {
  mode: 'naive' | 'key'
  cv: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  q: { t: number, fn: () => void }[] = []
  packets: Packet[] = []
  store = new Map<number, { status: string }>()
  charges = new Map<number, number>()
  intents = new Map<number, Intent>()
  answered = new Set<string>()
  flashes: { t: number, dup: boolean }[] = []
  inProc = 0
  ledger: { t: string, dup: boolean }[] = []
  s = { requested: 0, charged: 0, dup: 0, replays: 0, conflicts: 0, errCharged: 0 }
  constructor(mode: 'naive' | 'key', cv: HTMLCanvasElement) { this.mode = mode; this.cv = cv; this.ctx = cv.getContext('2d')!; this.reset() }
  reset() {
    this.q = []; this.packets = []; this.store = new Map(); this.charges = new Map(); this.intents = new Map()
    this.answered = new Set(); this.flashes = []; this.inProc = 0; this.ledger = []
    this.s = { requested: 0, charged: 0, dup: 0, replays: 0, conflicts: 0, errCharged: 0 }
    this.render()
  }
  at(t: number, fn: () => void) { this.q.push({ t, fn }) }
  tick() {
    this.q.sort((a, b) => a.t - b.t)
    while (this.q.length && this.q[0]!.t <= clock) this.q.shift()!.fn()
    this.packets = this.packets.filter(p => clock < p.t1 + (p.lost ? 700 : 0))
    this.flashes = this.flashes.filter(f => clock < f.t + 400)
  }
  start(id: number) {
    const chains = cfg.dbl ? 2 : 1
    this.intents.set(id, { done: false, gaveUp: 0, chains, failed: false })
    this.s.requested++
    for (let c = 0; c < chains; c++) this.send(id, c, 0, clock + c * 130)
    this.render()
  }
  send(id: number, c: number, a: number, t: number) {
    this.at(t, () => {
      if (this.intents.get(id)!.done) return
      this.packets.push({ kind: 'req', t0: clock, t1: clock + T.travel, retry: a > 0 })
      this.at(clock + T.travel, () => this.arrive(id, c, a))
      this.at(clock + T.timeout, () => {
        const k = id + '.' + c + '.' + a
        if (!this.answered.has(k)) this.retry(id, c, a)
      })
    })
  }
  arrive(id: number, c: number, a: number) {
    if (this.mode === 'naive') return this.work(id, c, a)
    const rec = this.store.get(id)
    if (cfg.atomic) {
      if (rec && rec.status === 'done') { this.s.replays++; return this.at(clock + T.replay, () => this.respond(id, c, a, 'replay')) }
      if (rec) { this.s.conflicts++; return this.at(clock + T.conflict, () => this.respond(id, c, a, '409')) }
      this.store.set(id, { status: 'progress' })
      return this.work(id, c, a)
    }
    // check-then-insert: the read happens now, the key is written only after the work
    if (rec && rec.status === 'done') { this.s.replays++; return this.at(clock + T.replay, () => this.respond(id, c, a, 'replay')) }
    this.work(id, c, a)
  }
  work(id: number, c: number, a: number) {
    this.inProc++
    this.at(clock + T.proc, () => {
      this.inProc--
      this.charge(id)
      if (this.mode === 'key') this.store.set(id, { status: 'done' })
      this.respond(id, c, a, 'ok')
    })
  }
  charge(id: number) {
    const n = (this.charges.get(id) || 0) + 1
    this.charges.set(id, n)
    this.s.charged++; if (n > 1) this.s.dup++
    this.flashes.push({ t: clock, dup: n > 1 })
    this.ledger.unshift({ t: 'B' + id + (n > 1 ? ' ×' + n : ''), dup: n > 1 })
    if (this.ledger.length > 48) this.ledger.pop()
    this.recount(); this.render()
  }
  respond(id: number, c: number, a: number, kind: Kind) {
    const lost = rnd(id, c, a) < cfg.loss / 100
    this.packets.push({ kind, t0: clock, t1: clock + T.travel * (lost ? .5 : 1), lost })
    if (lost) return
    this.at(clock + T.travel, () => {
      this.answered.add(id + '.' + c + '.' + a)
      const it = this.intents.get(id)!
      if (kind === '409') return this.retry(id, c, a)
      if (!it.done) { it.done = true; it.failed = false; this.recount(); this.render() }
    })
  }
  retry(id: number, c: number, a: number) {
    const it = this.intents.get(id)!
    if (it.done) return
    if (a >= cfg.retries) {
      it.gaveUp++
      if (it.gaveUp >= it.chains) { it.failed = true; this.recount(); this.render() }
      return
    }
    const wait = T.backoff * Math.pow(2, a) * (0.5 + rnd(id, c, a + 97))
    this.send(id, c, a + 1, clock + wait)
  }
  recount() {
    let e = 0
    for (const [id, it] of this.intents) if (it.failed && (this.charges.get(id) || 0) > 0) e++
    this.s.errCharged = e
  }
  render() {
    views[this.mode] = { stats: statRows(this.s), over: '₹' + (this.s.dup * PRICE).toLocaleString('en-IN'), ledger: this.ledger.slice() }
  }
  draw(col: Cols) {
    const cv = this.cv, ctx = this.ctx, dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth, h = cv.clientHeight
    if (!w || !h) return
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
    const bw = Math.min(96, w * .22), bh = 46
    const cx = 8, sx = w * .5 - bw / 2, px = w - bw - 8, by = 22
    const box = (x: number, label: string, sub: string, stroke: string | null) => {
      ctx.fillStyle = col.sunk; ctx.strokeStyle = stroke || col.line; ctx.lineWidth = stroke ? 2 : 1
      ctx.beginPath(); ctx.roundRect(x, by, bw, bh, 7); ctx.fill(); ctx.stroke()
      ctx.fillStyle = col.ink; ctx.font = `600 14px ${col.fb}`; ctx.textAlign = 'center'
      ctx.fillText(label, x + bw / 2, by + 20)
      ctx.fillStyle = col.muted; ctx.font = `14px ${col.fm}`; ctx.fillText(sub, x + bw / 2, by + 36)
    }
    const flash = this.flashes.length ? (this.flashes[this.flashes.length - 1]!.dup ? col.dup : col.ok) : null
    box(cx, 'Shopper', 'retries', null)
    box(sx, 'Checkout', this.inProc ? 'busy ' + this.inProc : 'idle', this.inProc ? col.accent : null)
    box(px, 'Payments', '₹ × ' + this.s.charged, flash)
    if (this.mode === 'key') {
      ctx.fillStyle = col.surface; ctx.strokeStyle = col.line; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(sx, by + bh + 50, bw, 34, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = col.muted; ctx.font = `14px ${col.fm}`; ctx.textAlign = 'center'
      ctx.fillText('keys: ' + this.store.size, sx + bw / 2, by + bh + 71)
      ctx.strokeStyle = col.line; ctx.beginPath(); ctx.moveTo(sx + bw / 2, by + bh); ctx.lineTo(sx + bw / 2, by + bh + 50); ctx.stroke()
    }
    const yReq = by + 10, yRes = by + bh - 10
    ctx.strokeStyle = col.line; ctx.setLineDash([3, 4]); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx + bw, yReq); ctx.lineTo(sx, yReq); ctx.moveTo(sx, yRes); ctx.lineTo(cx + bw, yRes)
    ctx.moveTo(sx + bw, by + bh / 2); ctx.lineTo(px, by + bh / 2); ctx.stroke(); ctx.setLineDash([])
    const x0 = cx + bw + 4, x1 = sx - 4
    for (const p of this.packets) {
      const dur = p.lost ? T.travel * .5 : T.travel
      const prog = Math.min(1, (clock - p.t0) / dur)
      let x: number, y: number, c: string
      if (p.kind === 'req') { x = x0 + (x1 - x0) * prog; y = yReq; c = col.accent }
      else {
        const frac = p.lost ? prog * .5 : prog
        x = x1 - (x1 - x0) * frac; y = yRes
        c = p.kind === 'replay' ? col.replay : p.kind === '409' ? col.warn : col.ok
      }
      if (p.lost && clock >= p.t1) {
        const fade = 1 - Math.min(1, (clock - p.t1) / 700)
        ctx.globalAlpha = fade; ctx.strokeStyle = col.dup; ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke()
        ctx.globalAlpha = 1; continue
      }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, p.retry ? 6 : 5, 0, Math.PI * 2); ctx.fill()
      if (p.retry) { ctx.strokeStyle = col.surface; ctx.lineWidth = 1.5; ctx.stroke() }
    }
    for (const f of this.flashes) {
      const pr = (clock - f.t) / 400, x = sx + bw + (px - sx - bw) * pr
      ctx.fillStyle = f.dup ? col.dup : col.ok; ctx.beginPath(); ctx.arc(x, by + bh / 2, 4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = col.muted; ctx.font = `14px ${col.fb}`; ctx.textAlign = 'left'
    ctx.fillText('requests →', x0, by - 8)
    ctx.fillText('← responses', x0, yRes + 22)
  }
}

const cvNaive = ref<HTMLCanvasElement>()
const cvKey = ref<HTMLCanvasElement>()
let lanes: Lane[] = []
const book = () => { const id = nextIntent++; lanes.forEach(l => l.start(id)) }
const timers: ReturnType<typeof setTimeout>[] = []
const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)) }
function burst() { for (let i = 0; i < 10; i++) later(book, i * 160) }
function toggleAuto() { auto.value = !auto.value }
function resetAll() { seed++; nextIntent = 1; lanes.forEach(l => l.reset()) }
const keyPill = computed(() => cfg.atomic ? { text: 'atomic claim', cls: 'ok' } : { text: 'check-then-insert', cls: 'bad' })

let cols: Cols = noCols
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = (n: string) => cs.getPropertyValue(n).trim()
  cols = { ink: g('--ink'), muted: g('--muted'), line: g('--line'), sunk: g('--sunk'), surface: g('--surface'), accent: g('--signal'), ok: g('--ok'), dup: g('--bad'), warn: g('--spark'), replay: g('--c-4'), fb: g('--f-body') || noCols.fb, fm: g('--f-mono') || noCols.fm }
}

let raf = 0, stopped = false
let io: IntersectionObserver | undefined, mo: MutationObserver | undefined
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
onMounted(() => {
  lanes = [new Lane('naive', cvNaive.value!), new Lane('key', cvKey.value!)]
  readColors(); mq?.addEventListener('change', readColors)
  mo = new MutationObserver(readColors); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  let visible = true
  io = new IntersectionObserver(([e]) => { visible = e!.isIntersecting }); io.observe(cvNaive.value!)
  let last = performance.now()
  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(100, now - last); last = now
    if (visible) {
      clock += dt
      if (auto.value) { autoAcc += dt; if (autoAcc >= 900) { autoAcc = 0; book() } }
      for (const l of lanes) { l.tick(); l.draw(cols) }
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  // open in a working state: a few sample orders already in flight
  for (let i = 0; i < 4; i++) later(book, 300 + i * 400)
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); io?.disconnect(); mo?.disconnect(); mq?.removeEventListener('change', readColors) })
</script>

<style scoped>
.intro { display: flex; flex-direction: column; gap: 14px; }
ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; }
.hook { font-family: var(--f-mono); font-size: .95rem; color: var(--muted); border-left: 3px solid var(--bad); padding-left: 12px; }
.tldr { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; }
.tldr .tag, .callout .tag { font-family: var(--f-mono); font-size: .875rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 500; color: var(--signal); }
.story { display: grid; border-left: 2px solid var(--line); margin-left: 6px; }
.beat { position: relative; padding: 0 0 18px 20px; display: flex; flex-direction: column; gap: 4px; }
.beat::before { content: ""; position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--surface); border: 2px solid var(--signal); }
.beat .lbl { font-family: var(--f-mono); font-size: .875rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.callout { display: flex; flex-direction: column; gap: 6px; }
.callout.c-gotcha { background: color-mix(in srgb, var(--spark) 14%, transparent); }
.callout.c-gotcha .tag { color: var(--spark); }
.callout.c-num { background: color-mix(in srgb, var(--c-4) 14%, transparent); }
.callout.c-num .tag { color: var(--c-4); }
.analogy { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tile .t { font-family: var(--f-mono); font-size: .875rem; color: var(--muted); }
.flow { overflow-x: auto; }
.flow svg { display: block; min-width: 600px; width: 100%; height: auto; }
.tbl { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
.tbl table { min-width: 620px; }
.tbl th { background: var(--sunk); }
.tbl tr:last-child td { border-bottom: 0; }
.t-bad { color: var(--bad); font-weight: 600; } .t-good { color: var(--ok); font-weight: 600; } .t-meh { color: var(--spark); font-weight: 600; }
.ctl small, .hint-s { color: var(--muted); font-size: .875rem; line-height: 1.35; }
.toggle { display: flex; justify-content: flex-start !important; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }
.toggle input { width: 18px; height: 18px; accent-color: var(--signal); }
.lbtn[aria-pressed="true"] { background: var(--signal-soft); border-color: var(--signal); color: var(--signal); }
.lanes { display: grid; grid-template-columns: 1fr; gap: 16px; }
@container (min-width: 1100px) { .lanes { grid-template-columns: 1fr 1fr; } }
.lane { border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; background: var(--bg); }
.lane-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.lane-head h3 { font-size: 1.05rem; }
.lane canvas { height: 160px; border-radius: 6px; background: var(--surface); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; display: flex; flex-direction: column; min-width: 0; }
.stat .v { font-family: var(--f-mono); font-size: 1.25rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.stat .k { font-size: .875rem; color: var(--muted); line-height: 1.25; }
.stat.alert { border-color: var(--bad); }
.stat.alert .v { color: var(--bad); }
.money { font-size: .9rem; color: var(--muted); max-width: none; }
.money b { color: var(--bad); font-family: var(--f-mono); }
.ledger { display: flex; flex-wrap: wrap; gap: 4px; min-height: 30px; align-content: flex-start; max-height: 96px; overflow: hidden; }
.chip { font-family: var(--f-mono); font-size: .875rem; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
.chip.dup { background: color-mix(in srgb, var(--bad) 16%, transparent); color: var(--bad); font-weight: 600; }
.legend i.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.try { display: flex; flex-direction: column; gap: 10px; }
.try ol { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; }
.dbody ol, .dbody ul { margin: 0; }
details.answer { border-color: var(--signal); }
.prac { display: grid; }
.prow { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.prow:last-child { border-bottom: 0; }
.prow b { font-family: var(--f-mono); font-size: .875rem; color: var(--signal); font-weight: 500; }
@media (max-width: 520px) { .prow { grid-template-columns: 1fr; gap: 2px; } }
.recap { background: var(--ink); color: var(--bg); border-radius: var(--r-md); padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.recap h2 { color: var(--bg); }
.recap code { background: transparent; color: inherit; border: 1px solid currentColor; }
</style>
