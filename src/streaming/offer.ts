import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import type { InterventionOffer } from '../../types/index.js'

export async function publishWaiting(
  session_id: string,
  offer: InterventionOffer,
  timer_ms: number
): Promise<void> {
  await redis.publish(
    `canvas:stream:${session_id}`,
    JSON.stringify({ type: 'waiting', offer, timer_ms })
  )
  logger.info('[streaming:offer] published waiting', {
    session_id,
    offer_id: offer.id,
    seq: offer.seq,
    timer_ms,
  })
}

export async function publishOffer(session_id: string, offer: InterventionOffer): Promise<void> {
  await redis.publish(
    `canvas:stream:${session_id}`,
    JSON.stringify({ type: 'offer', offer })
  )
  logger.info('[streaming:offer] published offer', { session_id, offer_id: offer.id })
}

export async function publishWithdraw(session_id: string, offer_id: string): Promise<void> {
  await redis.publish(
    `canvas:stream:${session_id}`,
    JSON.stringify({ type: 'withdraw', offer_id })
  )
  logger.info('[streaming:offer] published withdraw', { session_id, offer_id })
}
