import type { Context, Next } from 'hono'
import { db } from '../db/client.js'
import { logger } from './logger.js'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

// FRONTEND-CONTRACT.md §11 row 1 — no route trusts a canvas_id/session_id in
// the body as proof of identity; every /api request must carry a Supabase JWT.
// Verified against the Auth server via the service-role client (not decoded
// locally), so a revoked/expired token is rejected even before its exp claim.
//
// EventSource (used by /api/stream/:sessionId) cannot set an Authorization
// header, so it is the one route allowed to carry the token as ?token=
// instead — same verification path either way.
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('authorization')
  const bearerToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  const token = bearerToken ?? c.req.query('token')

  if (!token) {
    logger.warn('[auth] missing token', { path: c.req.path })
    return c.json({ error: 'unauthorized' }, 401)
  }

  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) {
    logger.warn('[auth] invalid token', { path: c.req.path, error: error?.message })
    return c.json({ error: 'unauthorized' }, 401)
  }

  c.set('userId', data.user.id)
  await next()
}
