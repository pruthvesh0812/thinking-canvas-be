import { Hono } from 'hono'
import { generateObject } from 'ai'
import { z } from 'zod'
import { canvasEventSchema } from '../../types/index.js'
import { models, generateEmbedding } from '../lib/llm.js'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { getNode, updateSummary, updateEmbedding } from '../db/nodes.js'
import { appendToNodeSequence, getSession } from '../db/sessions.js'
import { getEdge } from '../db/edges.js'
import { recordContribution } from '../db/ai-contributions.js'

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

// Enrich one node in place: directional summary (gemini flash, thinking:low,
// structured) + embedding over its text. Idempotent — both writes are
// overwrites — so it is safe to re-run on a node.updated or a retried
// ghost.accepted.
async function enrichNode(node_id: string): Promise<void> {
  const node = await getNode(node_id)

  // The summary is the LOAD-BEARING half of enrichment: every agent's
  // serialized context renders nodes by summary + direction_marker, so a node
  // without one shows up blank in every edge line on the canvas. The embedding
  // only powers semantic_promote.
  //
  // These two are therefore deliberately NOT bundled into one Promise.all.
  // They were, and when the embedding model was retired upstream (404), the
  // rejection took the summary write down with it and failed the whole
  // request — leaving every node on every canvas with a null summary. The
  // summary is now committed on its own, and an embedding failure is logged
  // and swallowed so it can degrade semantic search without ever again
  // blinding the agents.
  const { object } = await generateObject({
    model: models.fast(),
    schema: directionalSummarySchema,
    system: DIRECTIONAL_SUMMARY_PROMPT,
    prompt: node.content ?? '',
    providerOptions: { google: models.thinking('low') },
  })

  await updateSummary(node_id, object.summary, object.direction_marker)

  try {
    // Embed the node's own text; fall back to the summary for an empty node.
    const embedding = await generateEmbedding(node.content || object.summary)
    await updateEmbedding(node_id, embedding)
  } catch (err) {
    logger.error('[route:canvas-event] embedding failed — summary kept', {
      node_id,
      error: (err as Error).message,
    })
  }
}

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
    if (event_type === 'node.created' || event_type === 'node.updated') {
      const node_id = parsed.data.node_id!

      // Directional summary + embedding. Runs on BOTH node.created and
      // node.updated: an edit makes the create-time enrichment stale (DESIGN
      // §4g — node.updated must re-enrich).
      await enrichNode(node_id)

      if (event_type === 'node.created') {
        await appendToNodeSequence(session_id, node_id)
        await inngest.send({
          name: 'canvas/node.created',
          data: { canvas_id, session_id, node_id },
        })
        logger.info('[route:canvas-event] node.created processed', { canvas_id, session_id, node_id })
      } else {
        logger.info('[route:canvas-event] node.updated enriched', { canvas_id, session_id, node_id })
      }

      return c.json({ ok: true })
    }

    if (event_type === 'ghost.accepted') {
      // The FE has already written the accepted ghost's nodes/edges (owner:'ai')
      // to Supabase; this is the explicit "enrich these AI nodes" signal. Run
      // the same enrich as node.created (summary + embedding + sequence append)
      // and write the first-ever ai_contributions audit rows.
      //
      // Deliberately does NOT inngest.send('canvas/node.created'): an AI
      // acceptance is not a new-node event, so it never re-triggers an agent on
      // the ghost's own output — independent of whether anything currently
      // subscribes to node.created.
      const node_ids = parsed.data.node_ids!
      const agent_role = parsed.data.agent_role!
      const session = await getSession(session_id)
      const alreadySequenced = new Set(session.node_sequence)

      // node_ids are independent of each other, so enrich/append/record them
      // concurrently. `alreadySequenced` is tracked locally (rather than
      // re-reading `session.node_sequence`, which never changes underneath
      // this request) so a duplicate id within the same payload still only
      // appends once.
      await Promise.all(
        node_ids.map(async (node_id) => {
          await enrichNode(node_id)

          // Idempotent sequence append — a retried ghost.accepted must not add
          // a duplicate. The accepted node is not in node_sequence yet (the FE
          // does not send node.created for accepted ghosts), so the first call
          // appends.
          if (!alreadySequenced.has(node_id)) {
            alreadySequenced.add(node_id)
            await appendToNodeSequence(session_id, node_id)
          }

          await recordContribution({
            canvas_id,
            session_id,
            agent_role,
            ghost_id: node_id,
            status: 'accepted',
          })
        })
      )

      logger.info('[route:canvas-event] ghost.accepted enriched', {
        canvas_id,
        session_id,
        node_ids,
        agent_role,
      })
      return c.json({ ok: true })
    }

    if (event_type === 'node.deleted') {
      const node_id = parsed.data.node_id!
      // The FE already deleted the row from Supabase before notifying us.
      // The fingerprint trigger bumped canvas_version on that DELETE. Fire the
      // impact event so task-07 can classify whether an in-flight offer was
      // anchored to the now-vanished node and warn/re-trigger accordingly.
      await inngest.send({
        name: 'canvas/intervention.impact',
        data: { canvas_id, session_id, deleted_node_id: node_id },
      })
      logger.info('[route:canvas-event] node.deleted — impact event fired', { canvas_id, session_id, node_id })
      return c.json({ ok: true })
    }

    if (event_type === 'edge.deleted') {
      const edge_id = parsed.data.edge_id!
      // Edge deletes include re-parents (edge.deleted + edge.created in the FE).
      // The fingerprint trigger has already bumped canvas_version. Fire impact
      // so task-07 can check whether any in-flight offer was anchored via this edge.
      await inngest.send({
        name: 'canvas/intervention.impact',
        data: { canvas_id, session_id, deleted_edge_id: edge_id },
      })
      logger.info('[route:canvas-event] edge.deleted — impact event fired', { canvas_id, session_id, edge_id })
      return c.json({ ok: true })
    }

    // event_type === 'edge.created'
    const edge = await getEdge(parsed.data.edge_id!)

    if (edge.both_existing && edge.edge_type !== 'question') {
      await inngest.send({
        name: 'canvas/edge.existing-nodes',
        data: {
          canvas_id,
          session_id,
          edge_id: edge.id,
          from_node_id: edge.from_node_id,
          to_node_id: edge.to_node_id,
        },
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
