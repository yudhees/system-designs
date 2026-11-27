/**
 * Scroll reveal: cards and section headings below the fold fade up once as they scroll in.
 * Pure opacity/transform, so nothing shifts layout. Skipped for reduced motion.
 * Elements already on screen are left alone (the hero has its own entrance), so nothing flashes.
 */
const SELECTOR = '.today-card, article.lab, .art, .feature, .card, .grid > *, .pg, .sub, main section > h2, main section > .cap'

export default defineNuxtPlugin((nuxtApp) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('rv-in')
      io.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })

  const scan = () => requestAnimationFrame(() => {
    const seen = new Map<Element, number>()
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
      if (el.classList.contains('rv') || el.closest('.hero, .bench')) return
      if (el.getBoundingClientRect().top < window.innerHeight * .92) return
      const n = seen.get(el.parentElement as Element) ?? 0
      seen.set(el.parentElement as Element, n + 1)
      el.style.setProperty('--d', `${Math.min(n, 4) * 50}ms`)
      el.classList.add('rv')
      io.observe(el)
    })
  })
  nuxtApp.hook('page:finish', () => setTimeout(scan, 60))
})
