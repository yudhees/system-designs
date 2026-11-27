/**
 * POST /api/subscribe  { email, company (honeypot), source }
 *
 * Adds the address to the newsletter provider. Providers send their own
 * confirmation (double opt-in) email, so nobody is subscribed without consent.
 *   kit        : https://developers.kit.com  (free plan: up to 10,000 subscribers)
 *   buttondown : https://docs.buttondown.com (free plan: up to 100 subscribers)
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Small in-memory limiter per IP. Serverless instances are short-lived, so this
// only blunts bursts; the provider's own limits are the real backstop.
const hits = new Map<string, { n: number, reset: number }>()
function limited(ip: string) {
  const now = Date.now()
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  const h = hits.get(ip)
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); return false }
  h.n++
  return h.n > 5
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, company?: string, source?: string }>(event).catch(() => ({} as any))
  const email = String(body?.email || '').trim().toLowerCase()
  // Only used as a referrer tag in Kit; keep it to a short slug.
  const source = String(body?.source || 'site').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80) || 'site'

  // Bots fill the hidden field. Pretend it worked.
  if (body?.company) return { ok: true, message: 'Check your inbox to confirm your subscription.' }

  if (!EMAIL.test(email) || email.length > 254) {
    throw createError({ statusCode: 422, message: 'Enter a valid email address, like you@company.com.' })
  }
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (limited(ip)) throw createError({ statusCode: 429, message: 'Too many attempts. Wait a minute and try again.' })

  const cfg = useRuntimeConfig(event)
  const provider = String(cfg.newsletterProvider || 'kit').toLowerCase()

  try {
    if (provider === 'kit') {
      if (!cfg.kitApiKey) throw new NotConfigured()
      const headers = { 'X-Kit-Api-Key': String(cfg.kitApiKey), 'Content-Type': 'application/json', Accept: 'application/json' }
      if (cfg.kitFormId) {
        // With a Kit form: create the subscriber as inactive, then add them to the form.
        // Kit sends the form's confirmation email (double opt-in) when that is turned on.
        await $fetch('https://api.kit.com/v4/subscribers', { method: 'POST', headers, body: { email_address: email, state: 'inactive' } })
        await $fetch(`https://api.kit.com/v4/forms/${encodeURIComponent(String(cfg.kitFormId))}/subscribers`, {
          method: 'POST', headers, body: { email_address: email, referrer: `${cfg.public.siteUrl}/?src=${encodeURIComponent(source)}` },
        })
        return { ok: true, message: 'Almost done. Check your inbox and confirm your subscription.' }
      }
      // No form: add the subscriber directly (active, no confirmation email). Upsert, so repeats are fine.
      await $fetch('https://api.kit.com/v4/subscribers', { method: 'POST', headers, body: { email_address: email, state: 'active' } })
      return { ok: true, message: "You're subscribed. A new lab will land in your inbox most mornings." }
    } else if (provider === 'buttondown') {
      if (!cfg.buttondownApiKey) throw new NotConfigured()
      await $fetch('https://api.buttondown.com/v1/subscribers', {
        method: 'POST',
        headers: { Authorization: `Token ${cfg.buttondownApiKey}`, 'Content-Type': 'application/json' },
        body: { email_address: email, tags: ['website', source] },
      }).catch((e: any) => {
        // Already subscribed is fine.
        if (e?.status === 400 && JSON.stringify(e?.data || '').includes('already')) return
        throw e
      })
    } else {
      throw new NotConfigured()
    }
  } catch (e: any) {
    if (e instanceof NotConfigured) {
      console.error('[subscribe] newsletter provider is not configured; set NUXT_NEWSLETTER_PROVIDER and its keys')
      throw createError({ statusCode: 503, message: 'Subscriptions open soon. Please check back in a day or two.' })
    }
    console.error('[subscribe] provider error', provider, e?.status, e?.data)
    if (e?.status === 422) throw createError({ statusCode: 422, message: 'That address was rejected. Check it for typos.' })
    throw createError({ statusCode: 502, message: 'Subscribing failed on our side. Try again in a minute.' })
  }

  return { ok: true, message: 'Almost done. Check your inbox and confirm your subscription.' }
})

class NotConfigured extends Error {}
