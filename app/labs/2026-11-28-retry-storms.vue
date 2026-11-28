<!-- sdl:title: Retry Storms -->
<!-- sdl:topic: Resilience -->
<template>
  <div class="labdoc">
    <header class="hero">
      <div class="eyebrow">System Design Lab · 2026-11-28 · Resilience</div>
      <h1>When retries turn a blip into an outage</h1>
      <p class="hook">The bad release was rolled back in 10 minutes. The backend stayed down for an hour. The extra 50 minutes came from retries.</p>
      <div class="tldr">
        <b class="tag">TL;DR</b>
        <p>A retry is a second request. When a service is already struggling, every client retrying at once can multiply its load by 3, 4 or even 243 times, so it never gets a chance to recover.</p>
        <p>Exponential <b>backoff</b> waits longer between tries. <b>Jitter</b> makes those waits random so clients don't retry in waves. A <b>retry budget</b> caps retries at about 10% of normal traffic. Only the budget limits the total.</p>
      </div>
    </header>

    <section>
      <div class="eyebrow">The real-world problem</div>
      <h2>A ride-hailing backend that could not get back up</h2>
      <p>Yandex Go engineers wrote this story. The developers in it are invented, but the story is built from real incidents on their taxi order platform. It has hundreds of microservices (small services that call each other over the network).</p>
      <div class="story">
        <div class="beat"><span class="lbl">The first fix</span><p>The order service saw timeouts from the pricing service. A developer added <b>three retries</b> with exponential backoff and full jitter to the shared HTTP client library, and the errors disappeared. Over the next three years, about every second call between services ended up with retries.</p></div>
        <div class="beat"><span class="lbl">What broke</span><p>A new release had a bug. When Redis (an in-memory data store) timed out, the order service crashed. The team rolled the release back <b>within 10 minutes</b>, but the backend did not recover. Many services sat at 100% CPU.</p></div>
        <div class="beat"><span class="lbl">The surprise</span><p>During recovery the order service handled <b>9× its usual load</b>. Its only caller sent 3× (one request plus two retries). Backoff had not removed the extra load. It had only <b>delayed</b> it.</p></div>
        <div class="beat"><span class="lbl">How they got out</span><p>About 20 minutes later they used a rate limiter to let in only <b>1% of users</b>. Then they added 5% at a time over the next half hour. The whole backend was down for <b>an entire hour</b>.</p></div>
        <div class="beat"><span class="lbl">What they changed</span><p>A <b>retry budget</b>: clients may retry only while retries stay under <b>10%</b> of successful requests, counted locally with a token bucket. Over the next year there were other incidents, but they saw <b>no amplification from retries</b>.</p></div>
      </div>
      <div class="callout c-num"><span class="tag">Real numbers from other teams</span>
        <ul>
          <li><b>Google Cloud (CRE team)</b>: their own retrying clients produced a peak "easily 3X the average". Adding a random ±1 minute (20%) to each retry flattened the traffic "almost immediately".</li>
          <li><b>Google SRE book</b>: with up to 3 attempts per request, load can grow to "just below 3X". Adding a 10% per-client retry budget cuts that to about <b>1.1×</b>.</li>
          <li><b>Amazon</b>: a five-deep stack of services where every layer retries on its own can put <b>243×</b> the load on the database.</li>
        </ul>
      </div>
    </section>

    <section>
      <div class="eyebrow">The concept</div>
      <h2>A crowd at a closed door</h2>
      <div class="analogy">
        <div class="tile"><span class="t">Instant retries</span><p>A shop door jams. Everyone in the queue pushes again right away, then again. When the door finally opens, the whole crowd jams it a second time.</p></div>
        <div class="tile"><span class="t">Backoff</span><p>Everyone agrees to wait 1, 2, then 4 minutes before trying again. Better, but they all come back at the <i>same</i> minute.</p></div>
        <div class="tile"><span class="t">Backoff + jitter</span><p>Each person waits a <i>random</i> time up to that limit. Arrivals spread out. But if the door stays shut long enough, the same crowd still builds up.</p></div>
        <div class="tile"><span class="t">Retry budget</span><p>The doorman hands out a few "try again" tickets. When they run out, people go home and come back later. The crowd can never be much bigger than normal.</p></div>
      </div>
      <ul>
        <li><b>Retry storm</b>: retries add so much load that the service stays overloaded after the original cause is gone.</li>
        <li><b>Amplification</b>: total attempts divided by real user requests. Three retries can mean <b>up to 4×</b>.</li>
        <li><b>Exponential backoff</b>: wait <code>base × 2^attempt</code>, up to a cap.</li>
        <li><b>Full jitter</b>: wait a random time between 0 and that backoff value.</li>
        <li><b>Retry budget</b>: a token bucket. Each success adds 0.1 token, each retry spends 1. No token, no retry.</li>
      </ul>

      <div class="callout c-key"><span class="tag">Key idea</span>
        <p>Backoff and jitter change <b>when</b> retries arrive. They do not change <b>how many</b>. In the Yandex simulations, backoff gave the same 4× amplification as instant retries, "just a bit later". Only a budget or a limit caps the total.</p></div>

      <h3>Retries multiply across layers</h3>
      <div class="flow" role="img" aria-label="Five layers of services, each making three attempts. Load on the database grows 3, 9, 27, 81, 243 times.">
        <svg viewBox="0 0 660 150">
          <g v-for="(n, i) in LAYERS" :key="n.k">
            <rect :x="10 + i * 110" y="40" width="96" height="50" rx="8" fill="var(--sunk)" stroke="var(--line)"/>
            <text :x="58 + i * 110" y="62" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-body)" font-size="14">{{ n.k }}</text>
            <text :x="58 + i * 110" y="80" text-anchor="middle" fill="var(--muted)" style="font-family:var(--f-mono)" font-size="14">3 tries</text>
            <text :x="58 + i * 110" y="118" text-anchor="middle" :fill="i > 2 ? 'var(--bad)' : 'var(--spark)'" style="font-family:var(--f-mono)" font-size="14" font-weight="600">{{ n.m }}</text>
            <line :x1="106 + i * 110" y1="65" :x2="120 + i * 110" y2="65" stroke="var(--signal)" stroke-width="2"/>
          </g>
          <rect x="560" y="40" width="92" height="50" rx="8" fill="var(--sunk)" stroke="var(--bad)" stroke-width="2"/>
          <text x="606" y="70" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-body)" font-size="14">database</text>
          <text x="330" y="22" text-anchor="middle" fill="var(--muted)" style="font-family:var(--f-body)" font-size="14">attempts reaching the next layer, per user request</text>
          <text x="330" y="142" text-anchor="middle" fill="var(--muted)" style="font-family:var(--f-body)" font-size="14">3 × 3 × 3 × 3 × 3 = 243</text>
        </svg>
      </div>

      <div class="tbl"><table>
        <thead><tr><th>Strategy</th><th>What it does</th><th>Load during a long outage</th><th>Main risk</th></tr></thead>
        <tbody>
          <tr><td><b>No retries</b></td><td>Fail once, show the error</td><td class="t-good">1×</td><td>Every short blip reaches users</td></tr>
          <tr><td><b>Instant retries</b></td><td>Try again right away</td><td class="t-bad">Up to 1 + retries (4× with 3)</td><td>Locks the service in overload</td></tr>
          <tr><td><b>Exponential backoff</b></td><td>Wait 0.5 s, 1 s, 2 s …</td><td class="t-bad">Same total, arrives later</td><td>Clients retry in synchronized waves</td></tr>
          <tr><td><b>Backoff + full jitter</b></td><td>Random wait up to the backoff</td><td class="t-meh">Same total, spread smoothly</td><td>Still overloads if the outage is long</td></tr>
          <tr><td><b>Backoff + jitter + retry budget</b></td><td>Retries ≤ 10% of successes</td><td class="t-good">About 1.1×</td><td>Some users see errors during long outages</td></tr>
        </tbody>
      </table></div>

      <div class="callout c-gotcha"><span class="tag">Gotchas</span>
        <ul>
          <li><b>Work for nobody.</b> A server keeps processing requests whose clients already timed out. That work is wasted. Sending a deadline with each request lets the server drop expired work. Yandex found this helps, but it adds to a budget, it does not replace one.</li>
          <li><b>Retries at every layer.</b> Google's rule: retry only at the layer directly above the one that is rejecting. Inner layers should return "overloaded, don't retry".</li>
          <li><b>Circuit breakers can overreact.</b> In a Yandex test, one failed database shard out of 5 hit 20% of users. A breaker set to trip at 10% errors cut off <i>all</i> traffic.</li>
          <li><b>Timers line up too.</b> Jobs that run "every minute" or "at midnight UTC" all fire together. Amazon adds jitter to all timers and periodic jobs.</li>
        </ul></div>
    </section>

    <section id="lab" ref="labEl">
      <div class="intro">
        <div class="eyebrow">Interactive lab</div>
        <h2>Knock the pricing service over</h2>
        <p><b>Try this:</b> inject an outage and find the retry policy that lets the service recover by itself after the outage ends.</p>
        <p class="hint-s">Both lanes get the same users: 200 new requests per second, a 1 s client timeout, and a server that can handle the capacity you set. During an outage the service restarts. Requests in flight are lost, and nothing is answered until it comes back.</p>
      </div>
      <div class="bench">
        <div class="controls">
          <div class="ctl"><label for="rs-out">Outage length <output>{{ cfg.outage }} s</output></label><input id="rs-out" v-model.number="cfg.outage" type="range" min="1" max="10" step="1"></div>
          <div class="ctl"><label for="rs-cap">Server capacity <output>{{ cfg.headroom }}% of normal load</output></label><input id="rs-cap" v-model.number="cfg.headroom" type="range" min="110" max="450" step="10"><small>130% means 30% spare room for bursts.</small></div>
          <div class="ctl"><label for="rs-ret">Max retries per request <output>{{ cfg.retries }}</output></label><input id="rs-ret" v-model.number="cfg.retries" type="range" min="1" max="5" step="1"></div>
          <div class="ctl"><label class="toggle"><input v-model="cfg.drop" type="checkbox"> Server drops expired requests</label><small>Deadline propagation: skip work whose client already gave up. Skipping still costs half a request.</small></div>
          <div class="btns">
            <button type="button" class="lbtn primary" @click="injectOutage">Inject outage</button>
            <button type="button" class="lbtn" @click="shedLoad">Lane A: admit 1% of users for 5 s</button>
            <button type="button" class="lbtn" @click="resetAll">Reset</button>
          </div>
        </div>
        <div class="scope">
          <div class="legend">
            <span><i class="ln" style="border-color:var(--signal)"></i>attempts sent (solid)</span>
            <span><i class="ln" style="border-color:var(--ok)"></i>users served (solid)</span>
            <span><i class="ln dash" style="border-color:var(--bad)"></i>server capacity (dashed)</span>
            <span><i class="ln dot" style="border-color:var(--muted)"></i>normal demand (dotted)</span>
            <span><i class="blk"></i>outage</span>
          </div>
          <div class="lanes">
            <div v-for="ln in LANE_KEYS" :key="ln" class="lane">
              <div class="lane-head"><h3>{{ ln === 'a' ? 'Lane A' : 'Lane B' }} · {{ STRAT_NAME[pick[ln]] }}</h3><span :class="['pill', views[ln].pill.cls]">{{ views[ln].pill.text }}</span></div>
              <div class="seg" role="group" :aria-label="'Retry policy for ' + (ln === 'a' ? 'lane A' : 'lane B')">
                <button v-for="o in STRATS" :key="o.v" type="button" :aria-pressed="pick[ln] === o.v" @click="pick[ln] = o.v">{{ o.label }}</button>
              </div>
              <small class="hint-s">{{ HINT[pick[ln]] }}</small>
              <canvas :ref="el => setCanvas(ln, el)" role="img" :aria-label="'Chart of load over the last 30 seconds for ' + STRAT_NAME[pick[ln]]"></canvas>
              <div class="stats">
                <div :class="['stat', { alert: views[ln].load >= 1.5 }]"><span class="v">{{ views[ln].load.toFixed(1) }}×</span><span class="k">Load now vs normal</span></div>
                <div :class="['stat', { alert: views[ln].peak >= 2 }]"><span class="v">{{ views[ln].peak.toFixed(1) }}×</span><span class="k">Peak since outage</span></div>
                <div :class="['stat', { alert: views[ln].served < 95 }]"><span class="v">{{ views[ln].served }}%</span><span class="k">Users served (last 2 s)</span></div>
                <div :class="['stat', { alert: views[ln].wasted >= 20 }]"><span class="v">{{ views[ln].wasted }}%</span><span class="k">Server work wasted</span></div>
                <div :class="['stat', 'wide', { alert: views[ln].stuck }]"><span class="v sm">{{ views[ln].recovery }}</span><span class="k">Recovery after the outage ended</span></div>
              </div>
            </div>
          </div>
          <div class="try">
            <h3>Try this</h3>
            <ol>
              <li>Press <b>Inject outage</b> with the defaults. Lane A (instant retries) spikes, then settles at about <b>4×</b> and stays there, even though the server is healthy again. Lane B (budget) is back in seconds.</li>
              <li>Switch lane A to <b>Backoff</b>, then to <b>Jitter</b>. Each time press <b>Reset</b> and inject again. Backoff comes back in square waves. Jitter smooths them out. Both still settle near 4×: they change <i>when</i> retries come, not <i>how many</i>.</li>
              <li>While lane A is stuck, press <b>Lane A: admit 1% of users</b>, the fix Yandex used. Once the retries drain, the server stays healthy when everyone comes back. Then try raising capacity to 450% instead: that also works, but you pay for 4.5× the servers.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>

    <section id="solve">
      <div class="eyebrow">Solve it</div>
      <h2>Design the retry policy for a payments app</h2>
      <div class="scenario">
        <p><b>Scenario.</b> A mobile-payments app is used in many countries. Each payment goes <b>phone → API gateway → wallet service → ledger database</b>. Today every layer has its own "retry 3 times" setting.</p>
        <p>Many users are on slow, unreliable mobile networks, so the app already retries on timeouts. A settlement job on every server runs at 00:00 UTC. Lunchtime in one large region is the daily peak.</p>
        <p>The ledger database sometimes needs a <b>30-second failover</b>. <b>Design the retries so a failover is a 30-second blip, not a one-hour outage, and no payment is charged twice.</b></p>
      </div>
      <details><summary>Hint 1: count the worst case</summary><div class="dbody"><p>Three layers × 3 attempts each = 27 attempts per payment at the database. Where should retries live, and what should the other layers do instead?</p></div></details>
      <details><summary>Hint 2: when vs how many</summary><div class="dbody"><p>Backoff and jitter answer "when". You still need something that answers "how many in total", per client, even with millions of phones.</p></div></details>
      <details><summary>Hint 3: the 00:00 UTC job and the retried payment</summary><div class="dbody"><p>Synchronized timers make their own storm. And a retried payment is only safe if the server can recognise it as a repeat.</p></div></details>
      <details class="answer"><summary>Reveal the model answer</summary><div class="dbody">
        <ul>
          <li><b>One retry layer.</b> The phone (or the gateway, but not both) retries. The wallet service and the database calls fail fast and return an "overloaded, don't retry" error, so 27× becomes at most a few ×.</li>
          <li><b>Capped exponential backoff with full jitter</b> on the phone, for example a base of 0.5 s and a cap of about 30 s, a little longer than the failover.</li>
          <li><b>Retry budget.</b> Each client keeps a token bucket: success adds 0.1, a retry costs 1. The gateway also tags attempts with a retry count and sheds retries first when it is busy.</li>
          <li><b>Timeouts and deadlines.</b> Base the timeout on the downstream p99.9 latency (the time that 99.9% of calls finish within), plus room for slow mobile networks. Pass the deadline down, so the wallet service drops work that nobody is waiting for.</li>
          <li><b>Idempotency key</b> per payment, created once on the phone and resent on every retry, so a retry can never charge twice.</li>
          <li><b>Jitter the timers.</b> Spread the 00:00 UTC job with a stable per-host offset (the same host always gets the same delay). Add jitter to app background syncs too.</li>
          <li><b>Emergency lever.</b> Admission control at the gateway (let in a percentage of users), with a runbook. It is the way out if a storm starts anyway.</li>
        </ul></div></details>
    </section>

    <section>
      <div class="eyebrow">In practice</div>
      <h2>Where retry policy actually lives</h2>
      <div class="prac">
        <div class="prow"><b>HTTP / RPC clients</b><p>Put one retry policy in the shared client library: max attempts, capped backoff, full jitter, a budget. Then one team can fix it for every service.</p></div>
        <div class="prow"><b>Cloud SDKs</b><p>Many SDKs ship standard retry modes. Amazon added token-bucket retry limiting to its SDK in 2016. Check that the defaults match your timeouts.</p></div>
        <div class="prow"><b>Service mesh / API gateway</b><p>Easy to turn retries on here. Make sure they are not also on in the app, or the attempts multiply.</p></div>
        <div class="prow"><b>Mobile apps</b><p>You can't patch millions of phones quickly. Ship backoff, jitter and a server-controlled "retry-after" or kill switch from day one.</p></div>
        <div class="prow"><b>Message queues</b><p>Redelivery is a retry too. Use growing redelivery delays and a dead-letter queue (a holding queue for messages that keep failing) instead of a hot loop.</p></div>
        <div class="prow"><b>Scheduled jobs</b><p>Cron-style jobs and periodic syncs need jitter as well. "Every hour on the hour" across a fleet is a self-made traffic spike.</p></div>
      </div>
    </section>

    <section>
      <div class="eyebrow">Recap</div>
      <div class="recap">
        <h2>Remember this</h2>
        <ul>
          <li>Every retry is extra load at the worst moment. Three retries can mean <b>4×</b>, and retries at five layers can mean <b>243×</b>.</li>
          <li>Backoff and jitter decide <b>when</b> retries arrive. A <b>retry budget</b> (about 10%) decides <b>how many</b>.</li>
          <li>Retry at <b>one layer</b>. Inner layers fail fast with "overloaded, don't retry".</li>
          <li>Pass deadlines, make writes idempotent, jitter your timers, and keep a load-shedding lever for emergencies.</li>
        </ul>
      </div>
    </section>

    <section>
      <div class="eyebrow">Sources</div>
      <h2>Read the originals</h2>
      <ol class="sources">
        <li><a href="https://medium.com/yandex/good-retry-bad-retry-an-incident-story-648072d3cee6" target="_blank" rel="noopener">Good Retry, Bad Retry: An Incident Story</a>: Yandex, Denis Isaev, 2024</li>
        <li><a href="https://cloud.google.com/blog/products/gcp/how-to-avoid-a-self-inflicted-ddos-attack-cre-life-lessons" target="_blank" rel="noopener">How to avoid a self-inflicted DDoS attack: CRE life lessons</a>: Google Cloud blog, Dave Rensin &amp; Adrian Hilton, 2016</li>
        <li><a href="https://sre.google/sre-book/handling-overload/" target="_blank" rel="noopener">Handling Overload</a>: Site Reliability Engineering, Google</li>
        <li><a href="https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter" target="_blank" rel="noopener">Timeouts, retries, and backoff with jitter</a>: Amazon Builders' Library, Marc Brooker, 2019</li>
        <li><a href="https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/" target="_blank" rel="noopener">Exponential Backoff And Jitter</a>: AWS Architecture Blog, Marc Brooker, 2015</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'

// Retry storm lab: two lanes get the same open-loop traffic (new user requests per second) against a
// server with fixed capacity and a FIFO queue. Clients time out after 1 s and retry by the lane's policy.
// The server still spends capacity on requests whose client already timed out ("wasted work"), which is
// what lets retries keep it overloaded after the outage ends. Time moves in 50 ms ticks.
type Strat = 'none' | 'instant' | 'backoff' | 'jitter' | 'budget'
type LaneKey = 'a' | 'b'
const STRATS: { v: Strat, label: string }[] = [
  { v: 'none', label: 'None' }, { v: 'instant', label: 'Instant' }, { v: 'backoff', label: 'Backoff' },
  { v: 'jitter', label: 'Jitter' }, { v: 'budget', label: 'Budget' },
]
const STRAT_NAME: Record<Strat, string> = { none: 'no retries', instant: 'instant retries', backoff: 'exponential backoff', jitter: 'backoff + full jitter', budget: 'backoff + jitter + budget' }
const HINT: Record<Strat, string> = {
  none: 'Fail once and show the error. No extra load, but users see every blip.',
  instant: 'Retry immediately after a timeout or rejection, up to the max.',
  backoff: 'Wait 0.5 s, 1 s, 2 s, 4 s (cap 8 s) between tries. Everyone waits the same time.',
  jitter: 'Same backoff, but each wait is random between 0 and that value (full jitter).',
  budget: 'Backoff + jitter, and a token bucket: each success adds 0.1 token, each retry costs 1.',
}
const LANE_KEYS: LaneKey[] = ['a', 'b']
const LAYERS = [{ k: 'app', m: '3×' }, { k: 'gateway', m: '9×' }, { k: 'service A', m: '27×' }, { k: 'service B', m: '81×' }, { k: 'service C', m: '243×' }]

const DT = 0.05, BASE = 200, TIMEOUT = 1, QSEC = 2, BUCKET = 0.25, WINDOW = 30, TOK_MAX = 20
const TPB = Math.round(BUCKET / DT), TO_TICKS = Math.round(TIMEOUT / DT)
const cfg = reactive({ outage: 4, headroom: 130, retries: 3, drop: false })
const pick = reactive<Record<LaneKey, Strat>>({ a: 'instant', b: 'budget' })

interface View { load: number, peak: number, served: number, wasted: number, recovery: string, stuck: boolean, pill: { text: string, cls: string } }
const blank = (): View => ({ load: 1, peak: 1, served: 100, wasted: 0, recovery: 'no outage yet', stuck: false, pill: { text: 'healthy', cls: 'ok' } })
const views = reactive<Record<LaneKey, View>>({ a: blank(), b: blank() })

interface Att { a: number, dl: number, done: boolean }
interface Pt { t: number, off: number, good: number, dem: number, stale: number, work: number }
interface Env { cap: number, down: boolean, crash: boolean, shed: boolean, maxR: number, drop: boolean }

function mulberry(s: number) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

class Sim {
  key: LaneKey
  rng = mulberry(7)
  q: Att[] = []
  qh = 0
  wheel = new Map<number, Att[]>()
  rq = new Map<number, number[]>()
  capAcc = 0
  arrAcc = 0
  tok = TOK_MAX
  b = { off: 0, good: 0, dem: 0, stale: 0, work: 0 }
  hist: Pt[] = []
  peak = 1
  lastBad = -1
  constructor(key: LaneKey, seed: number) { this.key = key; this.reset(seed) }
  reset(seed: number) {
    this.rng = mulberry(seed); this.q = []; this.qh = 0; this.wheel = new Map(); this.rq = new Map()
    this.capAcc = 0; this.arrAcc = 0; this.tok = TOK_MAX; this.b = { off: 0, good: 0, dem: 0, stale: 0, work: 0 }
    this.hist = []; this.peak = 1; this.lastBad = -1
  }
  get strat() { return pick[this.key] }
  push<T>(m: Map<number, T[]>, k: number, v: T) { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v) }
  send(a: number, env: Env) {
    this.b.off++
    if (this.q.length - this.qh >= env.cap * QSEC) return this.fail(a, env) // queue full: fast rejection
    const att: Att = { a, dl: tick + TO_TICKS, done: false }
    this.q.push(att); this.push(this.wheel, att.dl, att)
  }
  fail(a: number, env: Env) {
    const s = this.strat
    if (s === 'none' || a >= env.maxR) return
    if (s === 'budget') { if (this.tok >= 1) this.tok--; else return }
    let d = DT
    if (s !== 'instant') { d = Math.min(0.5 * 2 ** a, 8); if (s !== 'backoff') d = this.rng() * d }
    this.push(this.rq, tick + Math.max(1, Math.round(d / DT)), a + 1)
  }
  step(env: Env) {
    if (env.crash) { // restart: everything queued or in flight is lost at once
      for (let i = this.qh; i < this.q.length; i++) { const at = this.q[i]!; if (!at.done) { at.done = true; this.fail(at.a, env) } }
      this.q = []; this.qh = 0
    }
    this.arrAcc += BASE * DT * (0.9 + 0.2 * this.rng())
    while (this.arrAcc >= 1) { this.arrAcc--; this.b.dem++; if (env.shed && this.rng() > 0.01) continue; this.send(0, env) }
    const r = this.rq.get(tick); if (r) { this.rq.delete(tick); for (const a of r) this.send(a, env) }
    if (!env.down) {
      this.capAcc += env.cap * DT
      while (this.capAcc >= 1 && this.qh < this.q.length) {
        const at = this.q[this.qh++]!
        if (tick > at.dl) { // the client stopped waiting for this one
          if (env.drop) { this.capAcc -= 0.5; this.b.work += 0.5; continue }
          this.capAcc--; this.b.work++; this.b.stale++
        } else {
          this.capAcc--; this.b.work++; at.done = true; this.b.good++
          if (this.strat === 'budget') this.tok = Math.min(this.tok + 0.1, TOK_MAX)
        }
      }
      if (this.qh >= this.q.length) { this.q = []; this.qh = 0; this.capAcc = Math.min(this.capAcc, 1) }
      else if (this.qh > 4000) { this.q = this.q.slice(this.qh); this.qh = 0 }
    } else this.capAcc = 0
    const w = this.wheel.get(tick)
    if (w) { this.wheel.delete(tick); for (const at of w) if (!at.done) { at.done = true; this.fail(at.a, env) } }
  }
  bucket(t: number, outEnd: number) {
    const p: Pt = { t, off: this.b.off / BUCKET / BASE, good: this.b.good / BUCKET / BASE, dem: this.b.dem / BUCKET / BASE, stale: this.b.stale, work: this.b.work }
    this.hist.push(p); if (this.hist.length > WINDOW / BUCKET + 2) this.hist.shift()
    this.b = { off: 0, good: 0, dem: 0, stale: 0, work: 0 }
    this.peak = Math.max(this.peak, p.off)
    if (outEnd >= 0 && t > outEnd && p.good < 0.95 * p.dem) this.lastBad = t
  }
  view(t: number, down: boolean, outEnd: number): View {
    const last = this.hist.slice(-8), n = last.length || 1
    const load = this.hist.slice(-4).reduce((s, p) => s + p.off, 0) / Math.max(1, Math.min(4, this.hist.length))
    const good = last.reduce((s, p) => s + p.good, 0), dem = last.reduce((s, p) => s + p.dem, 0) || n
    const served = Math.min(100, Math.round(100 * good / dem))
    const work = last.reduce((s, p) => s + p.work, 0), stale = last.reduce((s, p) => s + p.stale, 0)
    const wasted = work ? Math.round(100 * stale / work) : 0
    let recovery = 'no outage yet', stuck = false
    if (down) recovery = 'outage in progress'
    else if (outEnd >= 0) {
      if (t - this.lastBad >= 3) recovery = this.lastBad < outEnd ? 'at once' : 'in ' + (this.lastBad - outEnd + BUCKET).toFixed(1) + ' s'
      else { recovery = 'not yet, ' + Math.floor(t - outEnd) + ' s and counting'; stuck = t - outEnd > 8 }
    }
    let pill = { text: 'healthy', cls: 'ok' }
    if (down) pill = { text: 'outage', cls: 'bad' }
    else if (served < 50 && load > 1.5) pill = { text: 'retry storm', cls: 'bad' }
    else if (served < 95) pill = { text: 'degraded', cls: 'warn' }
    return { load, peak: this.peak, served, wasted, recovery, stuck, pill }
  }
}

// global clock shared by both lanes
let tick = 0, outStart = -1, outEnd = -1, shedUntil = -1, seed = 7
const sims: Record<LaneKey, Sim> = { a: new Sim('a', seed), b: new Sim('b', seed) }
const canvases: Partial<Record<LaneKey, HTMLCanvasElement>> = {}
const labEl = ref<HTMLElement>()
function setCanvas(k: LaneKey, el: unknown) { if (el instanceof HTMLCanvasElement) canvases[k] = el }

const now = () => tick * DT
function injectOutage() {
  if (outStart >= 0 && now() < outEnd) return
  outStart = now(); outEnd = outStart + cfg.outage
  for (const k of LANE_KEYS) { sims[k].peak = 1; sims[k].lastBad = -1 }
}
let crashTick = -1
function shedLoad() { shedUntil = now() + 5 }
function resetAll() {
  seed++; tick = 0; outStart = -1; outEnd = -1; shedUntil = -1; crashTick = -1
  for (const k of LANE_KEYS) { sims[k].reset(seed); views[k] = blank() }
  timers.forEach(clearTimeout); timers.length = 0
}

function simStep() {
  const t = now(), down = outStart >= 0 && t >= outStart && t < outEnd
  const startTick = outStart >= 0 ? Math.round(outStart / DT) : -1
  const crash = startTick === tick && crashTick !== tick
  if (crash) crashTick = tick
  const env: Env = { cap: BASE * cfg.headroom / 100, down, crash, shed: t < shedUntil, maxR: cfg.retries, drop: cfg.drop }
  for (const k of LANE_KEYS) sims[k].step(k === 'a' ? env : { ...env, shed: false })
  tick++
  if (tick % TPB === 0) {
    for (const k of LANE_KEYS) { sims[k].bucket(now(), outEnd); views[k] = sims[k].view(now(), down, outEnd) }
  }
}

interface Cols { ink: string, muted: string, line: string, sunk: string, surface: string, signal: string, ok: string, bad: string, fb: string, fm: string }
const noCols: Cols = { ink: '#111', muted: '#666', line: '#ccc', sunk: '#eee', surface: '#fff', signal: '#44f', ok: '#2a7', bad: '#c33', fb: 'system-ui, sans-serif', fm: 'monospace' }
let cols: Cols = noCols
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = (n: string) => cs.getPropertyValue(n).trim()
  cols = { ink: g('--ink') || noCols.ink, muted: g('--muted') || noCols.muted, line: g('--line') || noCols.line, sunk: g('--sunk') || noCols.sunk, surface: g('--surface') || noCols.surface, signal: g('--signal') || noCols.signal, ok: g('--ok') || noCols.ok, bad: g('--bad') || noCols.bad, fb: g('--f-body') || noCols.fb, fm: g('--f-mono') || noCols.fm }
}

function yMax() {
  let m = Math.max(4, cfg.headroom / 100)
  for (const k of LANE_KEYS) for (const p of sims[k].hist) m = Math.max(m, p.off)
  return Math.min(10, Math.ceil(m + 0.5))
}

function draw(k: LaneKey, ym: number) {
  const cv = canvases[k]; if (!cv) return
  const ctx = cv.getContext('2d'); if (!ctx) return
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight
  if (!w || !h) return
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
  const L = 40, R = 8, T = 10, B = 26, pw = w - L - R, ph = h - T - B
  const t1 = now(), t0 = t1 - WINDOW
  const X = (t: number) => L + (t - t0) / WINDOW * pw, Y = (v: number) => T + ph - Math.min(v, ym) / ym * ph
  // outage band
  if (outStart >= 0 && outEnd > t0) {
    const a = Math.max(X(outStart), L), b = Math.min(X(Math.min(outEnd, t1)), L + pw)
    if (b > a) { ctx.fillStyle = cols.sunk; ctx.fillRect(a, T, b - a, ph); ctx.strokeStyle = cols.line; ctx.strokeRect(a, T, b - a, ph) }
  }
  // grid + axis labels
  ctx.font = `14px ${cols.fm}`; ctx.fillStyle = cols.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = cols.line; ctx.lineWidth = 1
  const step = ym > 6 ? 2 : 1
  for (let v = 0; v <= ym; v += step) { const y = Y(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.fillText(v + '×', L - 6, y) }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  for (let s = 0; s <= WINDOW; s += 10) { ctx.textAlign = s === 0 ? 'left' : s === WINDOW ? 'right' : 'center'; ctx.fillText(s === WINDOW ? 'now' : '−' + (WINDOW - s) + ' s', s === 0 ? L - 4 : L + s / WINDOW * pw, h - 6) }
  // reference lines
  ctx.lineWidth = 2
  ctx.setLineDash([2, 4]); ctx.strokeStyle = cols.muted; ctx.beginPath(); ctx.moveTo(L, Y(1)); ctx.lineTo(L + pw, Y(1)); ctx.stroke()
  ctx.setLineDash([7, 5]); ctx.strokeStyle = cols.bad; ctx.beginPath(); ctx.moveTo(L, Y(cfg.headroom / 100)); ctx.lineTo(L + pw, Y(cfg.headroom / 100)); ctx.stroke()
  ctx.setLineDash([])
  const series = (key: 'off' | 'good', c: string, lw: number) => {
    const hs = sims[k].hist; if (hs.length < 2) return
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath()
    let started = false
    for (const p of hs) { if (p.t < t0) continue; const x = X(p.t), y = Y(p[key]); if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y) }
    ctx.stroke()
  }
  series('good', cols.ok, 2.5)
  series('off', cols.signal, 2.5)
}

const timers: ReturnType<typeof setTimeout>[] = []
let raf = 0, stopped = false
let io: IntersectionObserver | undefined, mo: MutationObserver | undefined, mq: MediaQueryList | undefined
onMounted(() => {
  readColors()
  mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', readColors)
  mo = new MutationObserver(readColors); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  let visible = true
  if (labEl.value) { io = new IntersectionObserver(es => { visible = es[es.length - 1]!.isIntersecting }); io.observe(labEl.value) }
  let last = performance.now(), acc = 0
  const frame = (t: number) => {
    if (stopped) return
    const dt = Math.min(0.1, (t - last) / 1000); last = t
    if (visible) {
      acc += dt
      while (acc >= DT) { acc -= DT; simStep() }
      const ym = yMax()
      for (const k of LANE_KEYS) draw(k, ym)
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  // open in a working state: a first outage a few seconds in
  timers.push(setTimeout(injectOutage, 5000))
})
onBeforeUnmount(() => { stopped = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); io?.disconnect(); mo?.disconnect(); mq?.removeEventListener('change', readColors) })
</script>

<style scoped>
.intro { display: flex; flex-direction: column; gap: 12px; }
ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; }
.hook { font-family: var(--f-mono); font-size: 1rem; color: var(--muted); border-left: 3px solid var(--bad); padding-left: 12px; }
.tldr { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; }
.tldr .tag, .callout .tag { font-family: var(--f-mono); font-size: .875rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 500; color: var(--signal); }
.story { display: grid; border-left: 2px solid var(--line); margin-left: 6px; }
.beat { position: relative; padding: 0 0 18px 20px; display: flex; flex-direction: column; gap: 4px; }
.beat::before { content: ""; position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--surface); border: 2px solid var(--signal); }
.beat .lbl { font-family: var(--f-mono); font-size: .875rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.callout { display: flex; flex-direction: column; gap: 8px; }
.callout.c-gotcha { background: color-mix(in srgb, var(--spark) 14%, transparent); }
.callout.c-gotcha .tag { color: var(--spark); }
.callout.c-num { background: color-mix(in srgb, var(--c-4) 14%, transparent); }
.callout.c-num .tag { color: var(--c-4); }
.analogy { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tile .t { font-family: var(--f-mono); font-size: .875rem; color: var(--muted); }
.flow { overflow-x: auto; }
.flow svg { display: block; min-width: 620px; width: 100%; height: auto; }
.tbl { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
.tbl table { min-width: 640px; }
.tbl th { background: var(--sunk); }
.tbl tr:last-child td { border-bottom: 0; }
.t-bad { color: var(--bad); font-weight: 600; } .t-good { color: var(--ok); font-weight: 600; } .t-meh { color: var(--spark); font-weight: 600; }
.ctl small, .hint-s { color: var(--muted); font-size: .875rem; line-height: 1.4; }
.toggle { display: flex; justify-content: flex-start !important; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }
.toggle input { width: 18px; height: 18px; accent-color: var(--signal); }
.btns { flex-wrap: wrap; }
.lanes { display: grid; grid-template-columns: 1fr; gap: 16px; }
@container (min-width: 1100px) { .lanes { grid-template-columns: 1fr 1fr; } }
.lane { border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; background: var(--bg); }
.lane-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.lane-head h3 { font-size: 1.05rem; }
.lane .seg button { font-size: .875rem; padding: 8px 2px; }
.lane canvas { height: 210px; border-radius: 6px; background: var(--surface); }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@container (min-width: 600px) { .stats { grid-template-columns: repeat(4, 1fr); } }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; display: flex; flex-direction: column; min-width: 0; }
.stat.wide { grid-column: 1 / -1; }
.stat .v { font-family: var(--f-mono); font-size: 1.25rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.stat .v.sm { font-size: 1rem; }
.stat .k { font-size: .875rem; color: var(--muted); line-height: 1.25; }
.stat.alert { border-color: var(--bad); }
.stat.alert .v { color: var(--bad); }
.legend i.ln { display: inline-block; width: 22px; height: 0; border-top: 3px solid; margin-right: 6px; }
.legend i.ln.dash { border-top-style: dashed; }
.legend i.ln.dot { border-top-style: dotted; }
.legend i.blk { display: inline-block; width: 16px; height: 12px; background: var(--sunk); border: 1px solid var(--line); margin-right: 6px; }
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
