<script setup lang="ts">
/**
 * 3D version of the load balancer hero, drawn with three.js.
 * three is imported on demand, so no other page pays for it. If WebGL or the import
 * fails, the parent falls back to the flat SVG scene.
 */
const props = defineProps<{ up: boolean[], rps: number, loads: number[], hot: boolean[] }>()
const emit = defineEmits<{ (e: 'toggle', i: number): void, (e: 'fail'): void }>()

const host = ref<HTMLElement>()
const labels = ref<{ x: number, y: number }[]>([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])
const fixed = ref<{ users: { x: number, y: number }, lb: { x: number, y: number } }>({ users: { x: 8, y: 50 }, lb: { x: 40, y: 78 } })
const ready = ref(false)

let dispose = () => {}
const propsRef = toRef(() => props)

onMounted(async () => {
  let THREE: typeof import('three')
  try { THREE = await import('three') } catch { emit('fail'); return }
  const el = host.value
  if (!el) return

  let renderer: import('three').WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }) } catch { emit('fail'); return }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  el.prepend(renderer.domElement)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.domElement.className = 'cv'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 460 / 340, 0.1, 100)
  camera.position.set(-0.4, 2.2, 16.2)
  camera.lookAt(-0.4, 0, 0)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a8, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(-4, 7, 8)
  scene.add(sun)

  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'
  const mats = {
    signal: new THREE.MeshStandardMaterial({ roughness: .35, metalness: .1 }),
    lb: new THREE.MeshStandardMaterial({ roughness: .3, metalness: .25 }),
    ring: new THREE.MeshStandardMaterial({ roughness: .4, metalness: .3 }),
    ok: new THREE.MeshStandardMaterial({ roughness: .45 }),
    hot: new THREE.MeshStandardMaterial({ roughness: .45 }),
    dead: new THREE.MeshStandardMaterial({ roughness: .9 }),
    panel: new THREE.MeshStandardMaterial({ roughness: .6 }),
    dot: new THREE.MeshBasicMaterial(),
    dotHot: new THREE.MeshBasicMaterial(),
  }
  const paint = () => {
    mats.signal.color.set(css('--signal'))
    mats.lb.color.set(css('--ink'))
    mats.ring.color.set(css('--spark-fill'))
    mats.ok.color.set(css('--ok'))
    mats.hot.color.set(css('--bad'))
    mats.dead.color.set(css('--line'))
    mats.panel.color.set(css('--surface'))
    mats.dot.color.set(css('--signal'))
    mats.dotHot.color.set(css('--bad'))
  }
  paint()
  const mo = new MutationObserver(paint)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', paint)

  const U = new THREE.Vector3(-5, 0, 0)
  const L = new THREE.Vector3(-1.6, 0, 0)
  const S = [2.8, 0, -2.8].map(y => new THREE.Vector3(3.8, y, 0))

  // users: a small cluster of spheres
  const users = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 14), mats.signal)
    m.position.set((i % 2) * .5 - .25, (i - 2) * .55, ((i * 7) % 3 - 1) * .25)
    users.add(m)
  }
  users.position.copy(U)
  scene.add(users)

  // load balancer: dark sphere with a spinning ring
  const lb = new THREE.Group()
  lb.add(new THREE.Mesh(new THREE.SphereGeometry(.95, 40, 28), mats.lb))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, .09, 14, 64), mats.ring)
  ring.rotation.x = Math.PI / 2.4
  lb.add(ring)
  lb.position.copy(L)
  scene.add(lb)

  // servers: rack boxes with a lit front panel
  const racks: { g: InstanceType<typeof THREE.Group>, body: InstanceType<typeof THREE.Mesh>, led: InstanceType<typeof THREE.Mesh>, bar: InstanceType<typeof THREE.Mesh> }[] = []
  const hit: import('three').Object3D[] = []
  S.forEach((p, i) => {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 1.5), mats.ok)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, .26, .06), mats.panel)
    panel.position.set(0, -.2, .78)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, .14, .08), mats.ok)
    bar.position.set(0, -.2, .8)
    bar.geometry.translate(.8, 0, 0)
    bar.position.x = -.8
    const led = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), mats.ok)
    led.position.set(.9, .3, .78)
    g.add(body, panel, bar, led)
    g.position.copy(p)
    body.userData.i = i
    hit.push(body)
    scene.add(g)
    racks.push({ g, body, led, bar })
  })

  // request particles
  const N = 90
  const dotGeo = new THREE.SphereGeometry(.11, 10, 8)
  const dots = Array.from({ length: N }, (_, k) => {
    const m = new THREE.Mesh(dotGeo, mats.dot)
    scene.add(m)
    return { m, t: (k / N), s: 0, off: new THREE.Vector3((Math.random() - .5) * .5, (Math.random() - .5) * 1.4, 0), v: .22 + Math.random() * .08 }
  })
  let rr = 0
  const tmp = new THREE.Vector3()
  const ctrl = new THREE.Vector3()

  function place() {
    const w = el!.clientWidth, h = el!.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const proj = (v: import('three').Vector3, dy = 0) => {
      const p = v.clone().add(new THREE.Vector3(0, dy, 0)).project(camera)
      return { x: (p.x * .5 + .5) * 100, y: (-p.y * .5 + .5) * 100 }
    }
    labels.value = S.map(s => proj(s, -.95))
    fixed.value = { users: proj(U, -1.7), lb: proj(L, -1.5) }
  }
  place()
  const ro = new ResizeObserver(place)
  ro.observe(el)
  ready.value = true

  // interaction
  const ray = new THREE.Raycaster()
  const ptr = new THREE.Vector2()
  const pick = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    return ray.intersectObjects(hit, false)[0]?.object.userData.i as number | undefined
  }
  const onClick = (e: PointerEvent) => { const i = pick(e); if (i !== undefined) emit('toggle', i) }
  const onMove = (e: PointerEvent) => { renderer.domElement.style.cursor = pick(e) !== undefined ? 'pointer' : 'default' }
  renderer.domElement.addEventListener('pointerdown', onClick)
  renderer.domElement.addEventListener('pointermove', onMove)

  let raf = 0, visible = true, last = performance.now(), time = 0
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop() })
  io.observe(el)

  const col = new THREE.Color()
  function loop() {
    raf = 0
    if (!visible || document.hidden) { return }
    const now = performance.now()
    const dt = Math.min(.05, (now - last) / 1000)
    last = now; time += dt
    const { up, rps, hot } = propsRef.value
    const alive = up.map((u, i) => (u ? i : -1)).filter(i => i >= 0)
    const active = Math.round((rps / 150) * N * .85)

    ring.rotation.z += dt * 1.4
    lb.rotation.y += dt * .4
    users.rotation.y = Math.sin(time * .6) * .25
    racks.forEach((r, i) => {
      const dead = !up[i]
      r.body.material = dead ? mats.dead : hot[i] ? mats.hot : mats.ok
      r.led.material = dead ? mats.dead : hot[i] ? mats.hot : mats.ok
      r.bar.material = dead ? mats.dead : hot[i] ? mats.hot : mats.ok
      const load = Math.min(1.15, (propsRef.value.loads[i] || 0) / 60)
      r.bar.scale.x += ((dead ? 0.001 : Math.max(.02, load)) - r.bar.scale.x) * Math.min(1, dt * 8)
      const target = dead ? -.35 : 0
      r.g.position.y += ((S[i].y + target) - r.g.position.y) * Math.min(1, dt * 6)
      r.g.rotation.z += ((dead ? -.12 : 0) - r.g.rotation.z) * Math.min(1, dt * 6)
      const s = hot[i] && !dead ? 1 + Math.sin(time * 14) * .02 : 1
      r.g.scale.setScalar(s)
    })

    dots.forEach((d, k) => {
      if (k >= active) { d.m.visible = false; return }
      d.t += dt * d.v * (rps > 100 ? 1.35 : 1)
      if (d.t >= 1) { d.t -= 1; d.s = alive.length ? alive[rr++ % alive.length] : -1 }
      if (d.t < .42) {
        const u = d.t / .42
        d.m.position.lerpVectors(U, L, u).addScaledVector(d.off, 1 - u)
        d.m.material = mats.dot
        d.m.visible = true
        d.m.scale.setScalar(1)
      } else if (d.s >= 0 && up[d.s]) {
        const u = (d.t - .42) / .58
        const T = S[d.s]
        ctrl.set((L.x + T.x) / 2, T.y * .9, 0)
        tmp.set(0, 0, 0)
        const a = 1 - u
        tmp.addScaledVector(L, a * a).addScaledVector(ctrl, 2 * a * u).addScaledVector(T, u * u)
        d.m.position.copy(tmp)
        d.m.material = hot[d.s] ? mats.dotHot : mats.dot
        d.m.visible = true
        d.m.scale.setScalar(u > .92 ? (1 - u) * 12 : 1)
      } else { d.m.visible = false }
    })

    void col
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  loop()
  const onVis = () => { if (!document.hidden && visible && !raf) { last = performance.now(); loop() } }
  document.addEventListener('visibilitychange', onVis)

  dispose = () => {
    cancelAnimationFrame(raf); raf = 0; visible = false
    io.disconnect(); ro.disconnect(); mo.disconnect()
    mq.removeEventListener('change', paint)
    document.removeEventListener('visibilitychange', onVis)
    renderer.domElement.removeEventListener('pointerdown', onClick)
    renderer.domElement.removeEventListener('pointermove', onMove)
    scene.traverse((o) => { const m = o as import('three').Mesh; m.geometry?.dispose?.() })
    Object.values(mats).forEach(m => m.dispose())
    renderer.dispose()
    renderer.domElement.remove()
  }
})
onBeforeUnmount(() => dispose())
</script>

<template>
  <div ref="host" class="h3d">
    <template v-if="ready">
      <span class="lab" :style="{ left: `${fixed.users.x}%`, top: `${fixed.users.y}%` }">Users<small>{{ rps }} req/s</small></span>
      <span class="lab" :style="{ left: `${fixed.lb.x}%`, top: `${fixed.lb.y}%` }">Load balancer</span>
      <span v-for="(l, i) in labels" :key="i" :class="['lab', { dead: !up[i], hot: hot[i] }]" :style="{ left: `${l.x}%`, top: `${l.y}%` }">
        Server {{ i + 1 }}<small>{{ up[i] ? `${Math.round(loads[i])} req/s` : 'Crashed' }}</small>
      </span>
    </template>
  </div>
</template>

<style scoped>
.h3d { position: relative; aspect-ratio: 460 / 340; width: 100%; border-radius: var(--r-lg); background: var(--surface); border: 1.5px solid var(--line); overflow: hidden; }
.h3d :deep(.cv) { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y; }
.lab { position: absolute; transform: translate(-50%, 0); font: 700 .9rem var(--f-body); color: var(--ink); text-align: center; line-height: 1.2; pointer-events: none; white-space: nowrap; }
.lab small { display: block; font-weight: 500; font-size: .82rem; color: var(--muted); }
.lab.hot small { color: var(--bad); font-weight: 700; }
.lab.dead { opacity: .7; }
@media (max-width: 420px) { .lab { font-size: .8rem; } .lab small { font-size: .75rem; } }
</style>
