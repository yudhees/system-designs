import { vi } from 'vitest'
import { resolve } from 'node:path'

export interface Ctx { body?: unknown, ip?: string, config?: Record<string, any>, fetch?: (url: string, opts: any) => any }

/** Stubs the Nitro/h3 auto-imports a server route uses, then imports the route fresh. */
export async function loadRoute(path: string, ctx: Ctx) {
  vi.resetModules()
  const headers: Record<string, string> = {}
  const fetchMock = vi.fn(ctx.fetch ?? (async () => ({})))
  vi.stubGlobal('defineEventHandler', (fn: any) => fn)
  vi.stubGlobal('readBody', async () => ctx.body)
  vi.stubGlobal('getRequestIP', () => ctx.ip ?? '203.0.113.1')
  vi.stubGlobal('setHeader', (_e: unknown, k: string, v: string) => { headers[k] = v })
  vi.stubGlobal('createError', (o: any) => Object.assign(new Error(o.message), o))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: 'https://example.test/' }, ...ctx.config }))
  vi.stubGlobal('$fetch', fetchMock)
  const mod = await import(/* @vite-ignore */ resolve(process.cwd(), path.replace(/^\.\.\//, '')))
  return { handler: mod.default as (e: unknown) => Promise<any> | any, fetchMock, headers }
}

export async function statusOf(p: Promise<unknown>) {
  try { await p } catch (e: any) { return e.statusCode as number }
  return 200
}
