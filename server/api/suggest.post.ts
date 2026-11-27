/**
 * POST /api/suggest  { topic, details?, name?, email?, website (honeypot), startedAt }
 *
 * Emails a visitor's lab topic suggestion to the site owner through Resend
 * (https://resend.com, free plan: 3,000 emails a month, 100 a day).
 * The API key and the owner's address come from environment variables, never the repo:
 *   NUXT_RESEND_API_KEY   Resend API key
 *   NUXT_SUGGEST_TO       address that receives suggestions
 *   NUXT_SUGGEST_FROM     sender; defaults to Resend's shared test sender, which can only
 *                         deliver to the address you signed up to Resend with
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const LIMITS = { topic: 120, details: 2000, name: 80 }

// Per-IP limiter: 3 suggestions per 10 minutes. Serverless instances are short-lived,
// so this blunts bursts; Resend's daily cap is the real backstop.
const hits = new Map<string, { n: number, reset: number }>()
function limited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 10 * 60_000 }); return false }
  h.n++
  return h.n > 3
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max)
const oneLine = (s: string) => s.replace(/\s+/g, ' ')

const OK = { ok: true, message: 'Thanks! Your suggestion is in, and it goes straight into the lab queue.' }

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({} as Record<string, unknown>))

  // Bots fill the hidden field or submit instantly. Pretend it worked.
  const startedAt = Number(body?.startedAt) || 0
  if (body?.website || (startedAt && Date.now() - startedAt < 2500)) return OK

  const topic = oneLine(clean(body?.topic, LIMITS.topic))
  const details = clean(body?.details, LIMITS.details)
  const name = oneLine(clean(body?.name, LIMITS.name))
  const email = clean(body?.email, 254).toLowerCase()

  if (topic.length < 3) throw createError({ statusCode: 422, message: 'Tell us the topic in a few words, like “Leader election”.' })
  if (email && !EMAIL.test(email)) throw createError({ statusCode: 422, message: 'That email looks wrong. Fix it or leave it empty.' })
  // Link-stuffed spam: more than three URLs is not a topic idea.
  if (((topic + details).match(/https?:\/\//g) || []).length > 3) return OK

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (limited(ip)) throw createError({ statusCode: 429, message: 'You have sent a few already. Wait ten minutes and try again.' })

  const cfg = useRuntimeConfig(event)
  if (!cfg.resendApiKey || !cfg.suggestTo) {
    console.error('[suggest] email is not configured; set NUXT_RESEND_API_KEY and NUXT_SUGGEST_TO')
    throw createError({ statusCode: 503, message: 'Suggestions open soon. Please check back in a day or two.' })
  }

  const from = String(cfg.suggestFrom || 'System Design Lab <onboarding@resend.dev>')
  const rows: [string, string][] = [['Topic', topic], ['Details', details || '(none)'], ['From', name || '(anonymous)'], ['Email', email || '(not given)']]
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n\n') + `\n\nSent from ${cfg.public.siteUrl}/suggest`
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#14233b">
<h2 style="margin:0 0 16px;font-size:20px">New lab topic suggestion</h2>
<table cellpadding="8" style="border-collapse:collapse">${rows.map(([k, v]) =>
  `<tr><td style="vertical-align:top;color:#5b6679;white-space:nowrap">${k}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#5b6679;font-size:13px;margin-top:20px">Sent from ${esc(String(cfg.public.siteUrl))}/suggest${email ? '. Reply to this email to answer them directly.' : ''}</p></div>`

  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
      body: {
        from,
        to: String(cfg.suggestTo).split(',').map(s => s.trim()).filter(Boolean),
        subject: `Topic suggestion: ${topic}`,
        text,
        html,
        ...(email ? { reply_to: email } : {}),
        tags: [{ name: 'type', value: 'topic_suggestion' }],
      },
    })
  } catch (e: any) {
    console.error('[suggest] resend error', e?.status, e?.data)
    throw createError({ statusCode: 502, message: 'Sending failed on our side. Try again in a minute.' })
  }

  return OK
})
