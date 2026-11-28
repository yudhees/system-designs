<!-- sdl:title: Retries, Backoff and Jitter -->
<!-- sdl:topic: Resilience -->
<template>
  <div class="labdoc">
    <header class="hero">
      <div class="eyebrow">System Design Lab · 2026-11-28 · Resilience</div>
      <h1>Retries, backoff and jitter: how to fail politely</h1>
      <p class="hook">A service slows down for a few seconds. Every client retries. Now the service has several times its normal load, exactly when it can least afford it.</p>
      <div class="tldr">
        <b class="tag">TL;DR</b>
        <p>A retry is a bet that the next try will work. When many clients lose that bet at the same moment, their retries arrive together and make the outage bigger.</p>
        <p>Three habits work together: <b>wait longer after each failure</b> (backoff), <b>add randomness</b> so clients do not retry in step (jitter), and <b>cap the total number of retries</b> (a budget). Backoff and jitter shape when retries arrive. Only a budget limits how many.</p>
      </div>
    </header>

    <section>
      <div class="eyebrow">The real-world problem</div>
      <h2>Retries multiply across layers</h2>
      <div class="story">
        <div class="beat"><span class="lbl">The setup</span><p>Marc Brooker, writing in the Amazon Builders' Library, describes a request that passes through a stack of five services before it reaches a database. Each layer retries a failed call three times.</p></div>
        <div class="beat"><span class="lbl">What breaks</span><p>Retries multiply, they do not add. One failing database call is tried 3 times by the layer above it, and each of those is tried 3 times by the layer above that. Across five layers the database sees <b>243 times</b> the normal load (3 to the power of 5).</p></div>
        <div class="beat"><span class="lbl">What they changed</span><p>The article recommends retrying at <b>one point</b> in the stack for cheap operations, adding backoff and jitter, and limiting retries with a <b>token bucket</b>: retries are allowed while tokens last, then continue only at a fixed slow rate. AWS added this behaviour to its SDK in 2016.</p></div>
        <div class="beat"><span class="lbl">What the data shows</span><p>In a separate AWS simulation of 100 clients competing for one database row, adding jitter to exponential backoff <b>cut the number of calls by more than half</b>. Plain exponential backoff without jitter was "the clear loser".</p></div>
      </div>
      <div class="callout c-num"><span class="tag">Real numbers</span>
        <p>For choosing a timeout, the same article suggests accepting a small rate of false timeouts, for example <b>0.1%</b>, and setting the timeout near the downstream service's p99.9 latency (the time that 99.9% of calls beat).</p></div>
    </section>

    <section>
      <div class="eyebrow">The concept</div>
      <h2>A crowd at a door</h2>
      <div class="analogy">
        <div class="tile"><span class="t">Everyone retries now</span><p>A door sticks. Fifty people push again at the same instant. The door cannot open any easier, and the push is harder than before.</p></div>
        <div class="tile"><span class="t">Wait, randomly, then try</span><p>Each person waits a random, growing time before the next push. The pushes spread out, and the door gets quiet gaps in which it can open.</p></div>
      </div>
      <ul>
        <li><b>Backoff</b>: the wait before retry number <i>n</i> grows, usually doubling up to a cap.</li>
        <li><b>Jitter</b>: a random part of the wait. Without it, clients that failed together retry together, in waves.</li>
        <li><b>Retry budget</b>: a limit on how many retries a client may send compared with its normal requests.</li>
      </ul>
      <div class="callout c-key"><span class="tag">Key idea</span>
        <p>"Full jitter" picks each wait at random between zero and the backoff limit: <code>sleep = random(0, min(cap, base × 2^attempt))</code>. The waits stay short on average, but no two clients stay in step.</p></div>
      <div class="tbl"><table>
        <thead><tr><th>Technique</th><th>What it does</th><th>Helps with</th><th>Failure mode</th></tr></thead>
        <tbody>
          <tr><td>Retry at once</td><td>Sends the same request again immediately.</td><td>A rare lost packet.</td><td>Turns any slowdown into a load spike. Load grows with every layer.</td></tr>
          <tr><td>Exponential backoff</td><td>Doubles the wait each time, up to a cap.</td><td>Gives the server time to recover.</td><td>Clients that failed together still retry together, in waves.</td></tr>
          <tr><td>Backoff + jitter</td><td>Randomises each wait.</td><td>Breaks up retry waves, so the load arrives at a steadier rate.</td><td>Does not limit the total number of retries. Needs a cap on the wait and a maximum number of tries.</td></tr>
          <tr><td>Retry budget (token bucket)</td><td>Allows retries only while tokens remain. Tokens refill slowly.</td><td>Stops a long outage from multiplying load.</td><td>Some requests are not retried and fail. That is the point, but users must see a clear error.</td></tr>
          <tr><td>Retry at one layer</td><td>Only one layer in the stack retries. The others pass the error up.</td><td>Removes the multiplication across layers.</td><td>Needs a team agreement on which layer owns retries.</td></tr>
          <tr><td>Circuit breaker</td><td>Stops calling a dependency after many failures.</td><td>Protects a dependency that is clearly down.</td><td>The AWS article warns it adds "modal behavior" that is hard to test and can slow recovery.</td></tr>
        </tbody>
      </table></div>
      <div class="callout c-gotcha"><span class="tag">Gotcha</span>
        <ul>
          <li><b>Retry only what is safe to repeat.</b> A payment or an order needs an idempotency key first (see the lab from 2026-11-27). Otherwise a retry can create a duplicate.</li>
          <li><b>Do not retry errors that will never succeed</b>, such as a bad request or a permission error.</li>
          <li><b>Backoff protects the server, not the user.</b> Show progress or an honest error instead of an endless spinner.</li>
        </ul></div>
    </section>

    <section id="lab">
      <div class="intro">
        <div class="eyebrow">Interactive lab</div>
        <h2>Cause a brownout, then watch the retries</h2>
        <p><b>Try this:</b> start a brownout and compare how much traffic reaches the server in each lane. The left lane retries after a fixed short wait. The right lane uses the policy you pick. Both lanes get the same new requests.</p>
      </div>
      <div class="bench">
        <div class="controls">
          <div class="ctl"><span class="lbl">Right-lane policy</span>
            <div class="seg">
              <button v-for="o in STRATS" :key="o.v" type="button" :aria-pressed="P.strat === o.v" @click="setStrat(o.v)">{{ o.label }}</button>
            </div>
            <small>{{ NOTES[P.strat] }}</small>
          </div>
          <div class="ctl"><label for="rb-rate">New requests <output>{{ P.lambda }} per s</output></label><input id="rb-rate" v-model.number="P.lambda" type="range" min="20" max="90" step="5"><small>The server normally handles {{ CAP }} requests per second.</small></div>
          <div class="ctl"><label for="rb-tries">Max retries per request <output>{{ P.retries }}</output></label><input id="rb-tries" v-model.number="P.retries" type="range" min="1" max="8" step="1"></div>
          <div class="ctl"><label for="rb-sev">Capacity in a brownout <output>{{ P.sev }}%</output></label><input id="rb-sev" v-model.number="P.sev" type="range" min="10" max="80" step="5"><small>How much of its normal capacity the server keeps during the 8 second brownout.</small></div>
          <div class="ctl"><label class="toggle"><input v-model="P.thrash" type="checkbox"> Overload thrashing</label><small>When load stays above 1.5 times capacity, the server wastes effort and loses half of its capacity.</small></div>
          <div class="btns">
            <button type="button" class="lbtn primary" @click="startBrown">Start 8 s brownout</button>
            <button type="button" class="lbtn" @click="paused = !paused">{{ paused ? 'Run' : 'Pause' }}</button>
            <button type="button" class="lbtn" @click="resetAll">Reset</button>
          </div>
          <div class="ctl"><label for="rb-speed">Speed <output>{{ P.speed }}×</output></label><input id="rb-speed" v-model.number="P.speed" type="range" min="1" max="4" step="1"></div>
        </div>
        <div class="scope">
          <div class="legend">
            <span><i class="dot" style="background:var(--c-1)"></i>requests reaching the server</span>
            <span><i class="dot" style="background:var(--bad)"></i>above normal capacity</span>
            <span><i class="dot" style="background:var(--spark)"></i>brownout period</span>
            <span><i class="dash"></i>normal capacity ({{ CAP }} per s)</span>
            <span class="clock">{{ clock }}</span>
          </div>
          <div class="lanes">
            <div v-for="ln in LANES" :key="ln.id" class="lane">
              <div class="lane-head"><h3>{{ ln.id === 'A' ? 'Fixed short wait' : STRAT_NAME[P.strat] }}</h3><span :class="['pill', ln.id === 'A' ? 'bad' : 'ok']">{{ ln.id === 'A' ? 'no backoff' : 'backoff' }}</span></div>
              <canvas :ref="(el) => setCv(ln.id, el)" role="img" :aria-label="`${ln.id === 'A' ? 'Fixed short wait' : STRAT_NAME[P.strat]}: requests per second reaching the server over the last 30 seconds`"></canvas>
              <div class="stats"><div v-for="m in view[ln.id]" :key="m.k" :class="['stat', m.cls]"><span class="v">{{ m.v }}</span><span class="k">{{ m.k }}</span></div></div>
            </div>
          </div>
          <div class="try">
            <h3>Try this</h3>
            <ol>
              <li>Start a brownout with <b>Jitter + budget</b> on the right. The left lane's peak load jumps to about three or four times normal capacity and each request is tried two or three times. The right lane stays close to 1× and about 1 attempt per request.</li>
              <li>Switch the right lane to <b>Exp. backoff</b> or <b>Full jitter</b>. Its peak is not much lower than the left lane. Backoff and jitter spread retries over time and break up waves, but they do not limit how many retries are sent. Compare <b>Attempts per request</b>.</li>
              <li>Raise <b>Max retries</b> to 8. The lane without a budget sends even more traffic and the load gets worse. The budget lane stays near 1 attempt per request. The price is that some requests give up sooner.</li>
            </ol>
          </div>
          <p class="hint">The simulator is a simplified model: random arrivals, one server with a fixed requests-per-second capacity, errors returned at once when it is full, and a retry budget of one token per ten new requests. Real systems differ.</p>
        </div>
      </div>
    </section>

    <section id="solve">
      <div class="eyebrow">Solve it</div>
      <h2>The wallet top-up that took the payments service down</h2>
      <div class="scenario">
        <p>A mobile wallet app lets people top up their balance. The app calls an API gateway, which calls a wallet service, which calls a ledger service, which calls a database. Users are in many countries and often on slow mobile networks.</p>
        <p>One evening the database slows down for about 40 seconds. Every layer, including the app, retries a failed call 3 times with no wait. The database never recovers on its own: it stays overloaded for 25 minutes, until engineers turn the app off.</p>
        <p><b>Design the retry policy so that a short slowdown cannot turn into a long outage, and so that no user is charged twice.</b></p>
      </div>
      <details><summary>Hint 1: count the multiplication</summary><div class="dbody"><p>Four layers with 3 retries each means up to 3 to the power of 4 calls to the database for one user tap. Which layer should own the retries?</p></div></details>
      <details><summary>Hint 2: what limits the extra load?</summary><div class="dbody"><p>Backoff slows each client, but a million clients still add up. Think about a limit that does not depend on how many clients there are.</p></div></details>
      <details><summary>Hint 3: top-ups move money</summary><div class="dbody"><p>A retried top-up must not create a second top-up. What does the app send with every attempt?</p></div></details>
      <details class="answer"><summary>Reveal the model answer</summary><div class="dbody">
        <ul>
          <li><b>One retry layer.</b> Let the app (or the gateway) own retries. The wallet and ledger services fail fast and pass the error up.</li>
          <li><b>Backoff with full jitter</b> and a cap, with a small maximum number of tries, for example 3. Add a total deadline so the user sees a clear result within a known time.</li>
          <li><b>A retry budget</b> at the retrying layer: a token bucket where tokens refill from successful first attempts. When the budget is empty, fail without retrying.</li>
          <li><b>An idempotency key</b> created once per top-up and sent on every attempt, so the ledger can detect a repeat and return the first result.</li>
          <li><b>Timeouts chosen from data</b>, for example near the downstream p99.9 latency, so slow but healthy calls are not counted as failures.</li>
          <li><b>Shed load at the database edge.</b> A concurrency limit or queue in front of the ledger returns a quick "busy" error instead of letting every call pile up. Treat "busy" as a signal to back off.</li>
          <li><b>Circuit breaker, with care.</b> Use it only if you can test it, since it changes the system's behaviour once it opens.</li>
          <li><b>Honest user experience.</b> Show "we are retrying" for a short time, then a plain error with a safe way to try again later. Do not spin forever.</li>
        </ul></div></details>
    </section>

    <section>
      <div class="eyebrow">In practice</div>
      <h2>Where this lives in real systems</h2>
      <div class="prac">
        <div class="prow"><b>Client libraries</b><p>Many HTTP and RPC client libraries offer retry settings. Check whether they use jitter, a retry cap and a budget by default, and whether several layers in your stack each retry the same call.</p></div>
        <div class="prow"><b>API gateways and proxies</b><p>A gateway or service proxy can retry on behalf of services. If you enable it, count it as a layer in the multiplication and limit it with a retry budget.</p></div>
        <div class="prow"><b>Queues and logs</b><p>A consumer that fails a message and puts it straight back creates the same storm. Use a delay between redeliveries that grows, and move messages that keep failing to a separate queue.</p></div>
        <div class="prow"><b>Databases and caches</b><p>Connection pools and drivers often retry. Put a limit on in-flight work, so a slow database gets fewer requests instead of more.</p></div>
        <div class="prow"><b>Autoscaling and deploys</b><p>New instances start cold. If all clients retry at once after a deploy or a scale-in, the new instances are hit by the full crowd. Jitter spreads the return of traffic.</p></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">Recap</div>
      <div class="recap">
        <h2>Remember this</h2>
        <ul>
          <li>Retries multiply across layers. Three retries over five layers is 243 times the load.</li>
          <li>Backoff gives the server time to recover. Jitter stops clients from retrying in waves. Neither one limits the total.</li>
          <li>A retry budget limits the total extra load, whatever the number of clients.</li>
          <li>Retry only safe operations, and give risky ones an idempotency key.</li>
        </ul>
      </div>
    </section>

    <section>
      <div class="eyebrow">Sources</div>
      <h2>Read the originals</h2>
      <ol class="sources">
        <li><a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/">Timeouts, retries and backoff with jitter</a>: Marc Brooker, Amazon Builders' Library, 2019 (five layers, 3 retries each, 243 times load; token bucket; circuit breaker caveats; p99.9 timeouts)</li>
        <li><a href="https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/">Exponential Backoff And Jitter</a>: AWS Architecture Blog (simulation of clients contending for one database row; jitter cut calls by more than half with 100 clients)</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
// Retries lab: two lanes receive the same new requests. The left lane retries after a fixed short wait;
// the right lane uses the chosen policy. A server has fixed capacity; during a brownout it keeps only part of it.
// Failed attempts are rejected at once and retried according to the lane's policy.
const CAP = 100 // normal requests per second the server can handle
const DT = 0.05, BASE = 0.2, MAXWAIT = 6, BIN = 0.25, NBINS = 120
type Strat = 'exp' | 'full' | 'budget'
const STRATS: { v: Strat, label: string }[] = [{ v: 'exp', label: 'Exp. backoff' }, { v: 'full', label: 'Full jitter' }, { v: 'budget', label: 'Jitter + budget' }]
const STRAT_NAME: Record<Strat, string> = { exp: 'Exponential backoff, no jitter', full: 'Exponential backoff + full jitter', budget: 'Full jitter + retry budget' }
const NOTES: Record<Strat, string> = {
  exp: 'Wait 0.2 s, 0.4 s, 0.8 s and so on, up to 6 s. Clients that failed together still retry together.',
  full: 'Wait a random time between 0 and the backoff limit. Retries spread out.',
  budget: 'Full jitter, plus a token bucket: a retry needs a token, and tokens refill slowly from new requests.',
}
const LANES = [{ id: 'A' as const }, { id: 'B' as const }]
type Id = 'A' | 'B'
interface Stat { k: string, v: string, cls: string }

const P = reactive({ strat: 'budget' as Strat, lambda: 70, retries: 4, sev: 40, thrash: true, speed: 2 })
const paused = ref(false)
const clock = ref('0 s')
const view = reactive<Record<Id, Stat[]>>({ A: [], B: [] })
const cvs: Partial<Record<Id, HTMLCanvasElement>> = {}
const setCv = (id: Id, el: unknown) => { if (el) cvs[id] = el as HTMLCanvasElement }

let simT = 0, brownUntil = -1, binAcc = 0, binT = 0
const poisson = (m: number) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= Math.random() } while (p > L); return k - 1 }

class Lane {
  id: Id
  due: { t: number, a: number }[] = []
  credit = 0
  tokens = 10
  recent: number[] = []
  bins: { rate: number, brown: boolean }[] = []
  s = { started: 0, ok: 0, gaveUp: 0, attempts: 0, failed: 0, peak: 0 }
  constructor(id: Id) { this.id = id }
  reset() { this.due = []; this.credit = 0; this.tokens = 10; this.recent = []; this.bins = []; this.s = { started: 0, ok: 0, gaveUp: 0, attempts: 0, failed: 0, peak: 0 }; this.binN = 0 }
  binN = 0
  strat(): 'fixed' | Strat { return this.id === 'A' ? 'fixed' : P.strat }
  delay(a: number) {
    const st = this.strat()
    if (st === 'fixed') return BASE
    const lim = Math.min(MAXWAIT, BASE * Math.pow(2, a))
    return st === 'exp' ? lim : Math.random() * lim
  }
  step(t: number, newN: number, brown: boolean) {
    // attempts this step: new requests plus retries that are due
    const dueNow = this.due.filter(d => d.t <= t)
    if (dueNow.length) this.due = this.due.filter(d => d.t > t)
    const att = [...dueNow]
    for (let i = 0; i < newN; i++) att.push({ t, a: 0 })
    this.s.started += newN
    if (this.strat() === 'budget') this.tokens = Math.min(10, this.tokens + 0.1 * newN)
    const n = att.length
    this.s.attempts += n
    this.recent.push(n); if (this.recent.length > 20) this.recent.shift()
    const rate = this.recent.reduce((x, y) => x + y, 0) // attempts in the last second
    let cap = brown ? CAP * P.sev / 100 : CAP
    if (P.thrash && rate > 1.5 * CAP) cap *= 0.5
    this.credit = Math.min(this.credit + cap * DT, cap * DT * 2 + 1)
    const accept = Math.min(n, Math.floor(this.credit))
    this.credit -= accept
    // random subset is served; the rest are rejected
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = att[i]!; att[i] = att[j]!; att[j] = tmp }
    this.s.ok += accept
    for (let i = accept; i < n; i++) {
      const it = att[i]!
      this.s.failed++
      const canRetry = it.a < P.retries && (this.strat() !== 'budget' || this.tokens >= 1)
      if (canRetry) { if (this.strat() === 'budget') this.tokens -= 1; this.due.push({ t: t + this.delay(it.a), a: it.a + 1 }) }
      else this.s.gaveUp++
    }
    this.binN += n
  }
  closeBin(brown: boolean) {
    const rate = this.binN / BIN
    this.bins.push({ rate, brown }); if (this.bins.length > NBINS) this.bins.shift()
    this.s.peak = Math.max(this.s.peak, rate)
    this.binN = 0
  }
}
const lanes: Lane[] = [new Lane('A'), new Lane('B')]

let stepAcc = 0
function tick(dt: number) {
  stepAcc += dt
  const steps = Math.floor(stepAcc / DT + 1e-9)
  stepAcc -= steps * DT
  for (let i = 0; i < steps; i++) {
    simT += DT
    const brown = simT < brownUntil
    const n = poisson(P.lambda * DT)
    for (const l of lanes) l.step(simT, n, brown)
    binAcc += DT
    if (binAcc >= BIN - 1e-9) { binAcc = 0; binT++; for (const l of lanes) l.closeBin(brown) }
  }
}
function startBrown() { brownUntil = simT + 8 }
function setStrat(s: Strat) { P.strat = s; resetAll(false) }
function resetAll(brown = true) { simT = 0; brownUntil = -1; binAcc = 0; for (const l of lanes) l.reset(); tick(5); if (brown) startBrown() }

function render() {
  clock.value = Math.floor(simT) + ' s' + (simT < brownUntil ? ' · brownout' : '')
  for (const l of lanes) {
    const s = l.s, fin = s.ok + s.gaveUp
    const pk = s.peak / CAP
    view[l.id] = [
      { k: 'Peak load vs capacity', v: pk.toFixed(1) + '×', cls: pk > 1.3 ? 'alert' : '' },
      { k: 'Attempts per request', v: (s.attempts / Math.max(1, s.started)).toFixed(2), cls: '' },
      { k: 'Requests served', v: fin ? Math.round(100 * s.ok / fin) + '%' : '–', cls: '' },
      { k: 'Gave up', v: String(s.gaveUp), cls: s.gaveUp > 0 ? 'alert' : '' },
      { k: 'Failed attempts', v: String(s.failed), cls: '' },
      { k: 'Waiting to retry', v: String(l.due.length), cls: '' },
    ]
  }
}

const col = { ink: '#111', line: '#ccc', bad: '#c33', spark: '#c80', c1: '#44f', surface: '#fff' }
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = (n: string) => cs.getPropertyValue(n).trim()
  col.ink = g('--ink'); col.line = g('--line'); col.bad = g('--bad'); col.spark = g('--spark'); col.c1 = g('--c-1'); col.surface = g('--surface')
}
function draw(l: Lane, ymax: number) {
  const cv = cvs[l.id]; if (!cv) return
  const ctx = cv.getContext('2d')!, dpr = window.devicePixelRatio || 1
  const w = cv.clientWidth, h = cv.clientHeight
  if (!w || !h) return
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
  const bw = w / NBINS
  const y = (v: number) => h - 6 - (h - 12) * Math.min(1, v / ymax)
  l.bins.forEach((b, i) => {
    const x = (NBINS - l.bins.length + i) * bw
    if (b.brown) { ctx.globalAlpha = .14; ctx.fillStyle = col.spark; ctx.fillRect(x, 0, bw + .5, h); ctx.globalAlpha = 1 }
    ctx.fillStyle = b.rate > CAP * 1.05 ? col.bad : col.c1
    const yy = y(b.rate); ctx.fillRect(x, yy, Math.max(1, bw - .5), h - 6 - yy)
  })
  ctx.strokeStyle = col.ink; ctx.globalAlpha = .7; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
  ctx.beginPath(); ctx.moveTo(0, y(CAP)); ctx.lineTo(w, y(CAP)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
}

let raf = 0, stopped = false
let io: IntersectionObserver | undefined, mo: MutationObserver | undefined
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
onMounted(() => {
  readColors(); mq?.addEventListener('change', readColors)
  mo = new MutationObserver(readColors); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  resetAll(true)
  render()
  let visible = true
  io = new IntersectionObserver(([e]) => { visible = e!.isIntersecting }); io.observe(cvs.A!)
  let last = performance.now(), lastR = 0
  const frame = (now: number) => {
    if (stopped) return
    const real = Math.min(0.1, (now - last) / 1000); last = now
    if (visible) {
      if (!paused.value) tick(real * P.speed)
      const ymax = Math.max(CAP * 2.2, ...lanes.flatMap(l => l.bins.map(b => b.rate)) ) * 1.05
      for (const l of lanes) draw(l, ymax)
      if (now - lastR > 250) { render(); lastR = now }
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); io?.disconnect(); mo?.disconnect(); mq?.removeEventListener('change', readColors) })
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
.tbl { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
.tbl table { min-width: 620px; }
.tbl th { background: var(--sunk); }
.tbl tr:last-child td { border-bottom: 0; }
.ctl small { color: var(--muted); font-size: .875rem; line-height: 1.35; }
.toggle { display: flex; justify-content: flex-start !important; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }
.toggle input { width: 18px; height: 18px; accent-color: var(--signal); }
.seg { flex-wrap: wrap; }
.legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.legend .dash { width: 18px; border-top: 2px dashed var(--ink); display: inline-block; margin-right: 6px; }
.legend .clock { margin-left: auto; }
.lanes { display: grid; grid-template-columns: 1fr; gap: 16px; }
@container (min-width: 1100px) { .lanes { grid-template-columns: 1fr 1fr; } }
.lane { border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; background: var(--bg); }
.lane-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.lane-head h3 { font-size: 1.05rem; }
.lane canvas { height: 170px; border-radius: 6px; background: var(--surface); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; display: flex; flex-direction: column; min-width: 0; }
.stat .v { font-family: var(--f-mono); font-size: 1.25rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.stat .k { font-size: .875rem; color: var(--muted); line-height: 1.25; }
.stat.alert { border-color: var(--bad); }
.stat.alert .v { color: var(--bad); }
.try { display: flex; flex-direction: column; gap: 10px; }
.try ol { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; }
.dbody ol, .dbody ul { margin: 0; }
details.answer { border-color: var(--signal); }
.prac { display: grid; }
.prow { display: grid; grid-template-columns: 170px 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.prow:last-child { border-bottom: 0; }
.prow b { font-family: var(--f-mono); font-size: .875rem; color: var(--signal); font-weight: 500; }
@media (max-width: 520px) { .prow { grid-template-columns: 1fr; gap: 2px; } }
.recap { background: var(--ink); color: var(--bg); border-radius: var(--r-md); padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.recap h2 { color: var(--bg); }
</style>
