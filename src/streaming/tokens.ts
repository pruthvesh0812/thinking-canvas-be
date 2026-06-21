import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

// Streams an agent's text output to Redis as chunk messages, each targeting a
// specific ghost_id. Pass agent.stream(...).textStream as the source. Returns
// the full accumulated text so the caller can persist it as the thread turn.
export async function streamAgentOutput(
  stream: AsyncIterable<string>,
  ghostId: string,
  sessionId: string
): Promise<string> {
  const channel = `canvas:stream:${sessionId}`
  let tokens = 0
  let text = ''

  for await (const token of stream) {
    await redis.publish(
      channel,
      JSON.stringify({ type: 'chunk', target: ghostId, data: token })
    )
    text += token
    tokens++
  }

  logger.info('[streaming:tokens] stream complete', {
    session_id: sessionId,
    ghost_id: ghostId,
    tokens,
  })

  return text
}

export async function publishDone(sessionId: string): Promise<void> {
  await redis.publish(
    `canvas:stream:${sessionId}`,
    JSON.stringify({ type: 'done' })
  )
  logger.info('[streaming:tokens] done published', { session_id: sessionId })
}
