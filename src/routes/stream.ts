import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import type { RedisMessage } from '../../types/index.js'

export const streamRoute = new Hono()

// GET /api/stream/:sessionId — the only server-to-client push channel. Subscribes
// to the session's Redis channel and forwards every ghost message to the browser
// as an SSE data event. @upstash/redis delivers messages already deserialized.
streamRoute.get('/stream/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  const channel = `canvas:stream:${sessionId}`

  return streamSSE(c, async (stream) => {
    const sub = redis.subscribe<RedisMessage>(channel)
    logger.info('[route:stream] subscribed', { session_id: sessionId })

    // streamSSE closes the connection as soon as this callback resolves, so we
    // hold it open on a promise that settles ONLY on client abort or a write
    // error. `done` is purely informational and no longer tears down the
    // connection — one session = one long-lived subscription for as many
    // generations (and parked offers) as the session produces. Upstash pub/sub
    // has no replay, so closing on `done` would drop anything published during
    // the browser's reconnect window (FRONTEND-CONTRACT.md §6.1).
    await new Promise<void>((resolve) => {
      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        clearInterval(ping)
        void sub.unsubscribe()
        logger.info('[route:stream] closed', { session_id: sessionId })
        resolve()
      }

      // Keepalive — browsers drop an idle SSE connection after ~30s of silence.
      const ping = setInterval(() => {
        stream.writeSSE({ data: JSON.stringify({ type: 'ping' }) }).catch(() => cleanup())
      }, 25000)

      sub.on('message', ({ message }) => {
        // Forward every message verbatim (including `done`); the write error is
        // the real disconnect/backpressure signal, not any message type.
        stream.writeSSE({ data: JSON.stringify(message) }).catch(() => cleanup())
      })

      sub.on('error', (err) => {
        logger.error('[route:stream] subscriber error', { session_id: sessionId, error: err.message })
      })

      stream.onAbort(cleanup)
    })
  })
})
