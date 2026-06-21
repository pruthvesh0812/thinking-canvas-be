import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

// Streams an agent's text output to Redis as chunk messages, each targeting a
// specific ghost_id. Pass agent.stream(...).textStream as the source.
export async function streamAgentOutput(
  stream: AsyncIterable<string>,
  ghostId: string,
  sessionId: string
): Promise<void> {
  const channel = `canvas:stream:${sessionId}`
  let tokens = 0

  for await (const token of stream) {
    await redis.publish(
      channel,
      JSON.stringify({ type: 'chunk', target: ghostId, data: token })
    )
    tokens++
  }

  logger.info('[streaming:tokens] stream complete', {
    session_id: sessionId,
    ghost_id: ghostId,
    tokens,
  })
}

export async function publishDone(sessionId: string): Promise<void> {
  await redis.publish(
    `canvas:stream:${sessionId}`,
    JSON.stringify({ type: 'done' })
  )
  logger.info('[streaming:tokens] done published', { session_id: sessionId })
}
