import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import type { ContextNodeType, RedisMessage } from '../../types/index.js'

type DonePayload = Omit<Extract<RedisMessage, { type: 'done' }>, 'type'>

// One emit the marker router hands back to the caller for publishing. Mirrors
// the `chunk` / `node_type` RedisMessage variants (target is always a ghost id).
type StreamEmit =
  | { type: 'chunk'; target: string; data: string }
  | { type: 'node_type'; target: string; node_type: ContextNodeType }

const CONTEXT_NODE_TYPES: readonly string[] = [
  'reframe',
  'mirror',
  'pattern',
  'reference',
  'contradiction',
  'appreciation',
]

// The two control markers the backend owns and strips server-side. Everything
// else (including [ARTICULATION n]) stays in-band as ghost text.
const QUESTION_MARKER = '[QUESTION]'
const NODE_TYPE_PREFIX = '[NODE_TYPE:'
const NODE_TYPE_RE = /^\[NODE_TYPE:\s*([a-z_]+)\s*\]/

type MarkerMatch =
  | { kind: 'nodetype'; nodeType: string; rest: string }
  | { kind: 'question'; rest: string }
  | { kind: 'partial' } // buf could still grow into a control marker — wait for more tokens
  | { kind: 'none' } // buf[0] === '[' but this is definitely not a control marker

// Classify a buffer that is known to start with '['. Never consumes a marker
// that could still be completing across a chunk boundary (returns 'partial').
function matchMarker(buf: string): MarkerMatch {
  if (buf.startsWith(QUESTION_MARKER)) {
    return { kind: 'question', rest: buf.slice(QUESTION_MARKER.length) }
  }
  if (QUESTION_MARKER.startsWith(buf)) return { kind: 'partial' }

  if (buf.startsWith(NODE_TYPE_PREFIX)) {
    const m = NODE_TYPE_RE.exec(buf)
    if (m) return { kind: 'nodetype', nodeType: m[1], rest: buf.slice(m[0].length) }
    // No closing ']' yet. Still a valid, growing "[NODE_TYPE: <letters>"? wait.
    const tail = buf.slice(NODE_TYPE_PREFIX.length)
    if (/^\s*[a-z_]*$/.test(tail)) return { kind: 'partial' }
    return { kind: 'none' }
  }
  if (NODE_TYPE_PREFIX.startsWith(buf)) return { kind: 'partial' }

  return { kind: 'none' }
}

// A stateful, marker-aware router that buffers across chunk boundaries. Feed it
// tokens with push(); it returns the emits (chunks + node_type) that are safe to
// publish so far. Call flush() once the stream ends to drain any tail. Pure — no
// Redis — so it is unit-testable in isolation.
export function createMarkerRouter(opts: {
  contextGhostId: string
  questionGhostId: string | null
}) {
  const { contextGhostId, questionGhostId } = opts
  let buffer = ''
  let currentTarget = contextGhostId

  function drain(final: boolean): StreamEmit[] {
    const emits: StreamEmit[] = []
    const emitText = (t: string) => {
      if (t) emits.push({ type: 'chunk', target: currentTarget, data: t })
    }

    for (;;) {
      const idx = buffer.indexOf('[')
      if (idx === -1) {
        emitText(buffer)
        buffer = ''
        break
      }
      if (idx > 0) {
        emitText(buffer.slice(0, idx))
        buffer = buffer.slice(idx)
      }

      const m = matchMarker(buffer)
      if (m.kind === 'partial') {
        // Malformed marker at end of stream — never swallow text; flush literally.
        if (final) {
          emitText(buffer)
          buffer = ''
        }
        break
      }
      if (m.kind === 'nodetype') {
        if (CONTEXT_NODE_TYPES.includes(m.nodeType)) {
          emits.push({
            type: 'node_type',
            target: contextGhostId,
            node_type: m.nodeType as ContextNodeType,
          })
        } else {
          logger.warn('[streaming:tokens] unknown NODE_TYPE marker — dropped', {
            node_type: m.nodeType,
          })
        }
        buffer = m.rest
        continue
      }
      if (m.kind === 'question') {
        if (questionGhostId === null) {
          logger.warn('[streaming:tokens] [QUESTION] with no question ghost — kept on context')
        } else {
          currentTarget = questionGhostId
        }
        buffer = m.rest
        continue
      }
      // m.kind === 'none' — the '[' is literal text (e.g. [ARTICULATION). Emit it
      // and let the loop pick up the next '[' (coalescing the text between).
      emitText('[')
      buffer = buffer.slice(1)
    }

    return emits
  }

  return {
    push(token: string): StreamEmit[] {
      buffer += token
      return drain(false)
    },
    flush(): StreamEmit[] {
      return drain(true)
    },
  }
}

// Streams an agent's text output to Redis, splitting control markers server-side:
// [NODE_TYPE: x] becomes a typed `node_type` message on the context ghost, and
// text after [QUESTION] is routed to the question ghost id. Pass
// agent.stream(...).textStream as the source. Returns the full accumulated RAW
// text (markers included) so the caller persists the thread turn unchanged — the
// thread record stays the source of truth for re-parsing.
export async function streamAgentOutput(
  stream: AsyncIterable<string>,
  ghosts: { contextGhostId: string; questionGhostId: string | null },
  sessionId: string
): Promise<string> {
  const channel = `canvas:stream:${sessionId}`
  const router = createMarkerRouter(ghosts)
  let raw = ''
  let chunks = 0

  const publish = async (emit: StreamEmit) => {
    await redis.publish(channel, JSON.stringify(emit))
    if (emit.type === 'chunk') chunks++
  }

  for await (const token of stream) {
    raw += token
    for (const emit of router.push(token)) await publish(emit)
  }
  for (const emit of router.flush()) await publish(emit)

  logger.info('[streaming:tokens] stream complete', {
    session_id: sessionId,
    context_ghost_id: ghosts.contextGhostId,
    question_ghost_id: ghosts.questionGhostId,
    chunks,
  })

  return raw
}

// Publishes the attribution-carrying `done`. Persist the ghost_pair turn first,
// then call this with thread_id/turn_index/ghost ids so the FE can address the
// turn for POST /api/ghost-status without polling agent_threads.
export async function publishDone(sessionId: string, payload: DonePayload): Promise<void> {
  await redis.publish(
    `canvas:stream:${sessionId}`,
    JSON.stringify({ type: 'done', ...payload })
  )
  logger.info('[streaming:tokens] done published', {
    session_id: sessionId,
    thread_id: payload.thread_id,
    turn_index: payload.turn_index,
  })
}
