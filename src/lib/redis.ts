import { Redis } from '@upstash/redis'

// Upstash Redis singleton — pub/sub for ghost node streaming ONLY.
// Channel pattern: canvas:stream:${sessionId}
// Message types:   spawn | chunk | done | ping
// Never use as a persistent store or job queue (Inngest handles durability).
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
