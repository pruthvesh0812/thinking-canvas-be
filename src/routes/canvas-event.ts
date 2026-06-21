import { Hono } from 'hono'
import { generateObject } from 'ai'
import { z } from 'zod'
import { canvasEventSchema } from '../../types/index.js'
import { models, generateEmbedding } from '../lib/llm.js'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { getNode, updateSummary, updateEmbedding } from '../db/nodes.js'
import { appendToNodeSequence } from '../db/sessions.js'
import { getEdge } from '../db/edges.js'

// System prompt is a constant — never interpolated from user data.
const DIRECTIONAL_SUMMARY_PROMPT = `
You compress a single canvas node into one directional summary sentence.

Begin the sentence with EXACTLY one of these markers, chosen to fit the node:
- establishes  — states or asserts something
- questions    — asks or wonders
- contradicts  — pushes against or negates something
- explores     — opens up or branches an idea

Write exactly one sentence. Use at most 15 words after the marker. Output only
the structured fields requested.
` as const

const directionalSummarySchema = z.object({
  summary: z.string(),
  direction_marker: z.enum(['establishes', 'questions', 'contradicts', 'explores']),
})

export const canvasEventRoute = new Hono()

// POST /api/canvas-event — the single entry point for every user canvas action.
// Node events enrich the node (summary + embedding) before firing the pipeline;
// edge events read the authoritative edge row and route to the matching pipeline.
canvasEventRoute.post('/canvas-event', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = canvasEventSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:canvas-event] invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { canvas_id, session_id, event_type } = parsed.data
  logger.info('[route:canvas-event] received', { canvas_id, session_id, event_type })

  try {
    if (event_type === 'node.created') {
      const node_id = parsed.data.node_id!
      const node = await getNode(node_id)

      // Directional summary — gemini-2.5-flash, thinking:low, structured output.
      const { object } = await generateObject({
        model: models.fast(),
        schema: directionalSummarySchema,
        system: DIRECTIONAL_SUMMARY_PROMPT,
        prompt: node.content ?? '',
        providerOptions: { google: models.thinking('low') },
      })
      await updateSummary(node_id, object.summary, object.direction_marker)

      // Embedding over the node's actual text (gemini-embedding) for semantic recall.
      const embedding = await generateEmbedding(node.content ?? object.summary)
      await updateEmbedding(node_id, embedding)

      await appendToNodeSequence(session_id, node_id)

      await inngest.send({
        name: 'canvas/node.created',
        data: { canvas_id, session_id, node_id },
      })

      logger.info('[route:canvas-event] node.created processed', { canvas_id, session_id, node_id })
      return c.json({ ok: true })
    }

    // event_type === 'edge.created'
    const edge = await getEdge(parsed.data.edge_id!)

    if (edge.both_existing && edge.edge_type !== 'question') {
      await inngest.send({
        name: 'canvas/edge.existing-nodes',
        data: { canvas_id, session_id, edge_id: edge.id, from_node_id: edge.from_node_id },
      })
      logger.info('[route:canvas-event] edge.existing-nodes fired', { canvas_id, session_id, edge_id: edge.id })
    } else if (edge.edge_type === 'question') {
      await inngest.send({
        name: 'canvas/edge.question',
        data: { canvas_id, session_id, edge_id: edge.id, from_node_id: edge.from_node_id },
      })
      logger.info('[route:canvas-event] edge.question fired', { canvas_id, session_id, edge_id: edge.id })
    } else {
      // A new-node edge (one end did not previously exist) is, in effect, a node
      // creation — the new node sits at the edge's `to` end. Route it through the
      // main debounced pipeline.
      await inngest.send({
        name: 'canvas/node.created',
        data: { canvas_id, session_id, node_id: edge.to_node_id },
      })
      logger.info('[route:canvas-event] new-node edge → node.created', { canvas_id, session_id, edge_id: edge.id })
    }

    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:canvas-event] failed', { canvas_id, session_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
