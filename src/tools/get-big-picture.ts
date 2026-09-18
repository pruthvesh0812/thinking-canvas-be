import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_big_picture = createTool({
  id: 'get_big_picture',
  description: 'Fetch all node summaries and the full edge map for a canvas — bird\'s eye view for the Observer.',
  inputSchema: z.object({}),
  // canvas_id is server-injected via requestContext — see get_content.ts.
  requestContextSchema: z.object({
    canvas_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    nodes: z.array(z.object({
      node_id: z.string(),
      summary: z.string().nullable(),
      direction_marker: z.string().nullable(),
    })),
    edges: z.array(z.object({
      from: z.string(),
      to: z.string(),
      edge_type: z.string(),
    })),
  }),
  execute: async (_inputData, { requestContext }) => {
    const canvas_id = requestContext!.get('canvas_id') as string
    logger.info('[tool:get_big_picture] called', { canvas_id })

    const [nodesResult, edgesResult] = await Promise.all([
      db
        .from('nodes')
        .select('id, summary, direction_marker')
        .eq('canvas_id', canvas_id)
        .is('set_aside_at', null)
        .order('created_at', { ascending: true }),
      db
        .from('edges')
        .select('from_node_id, to_node_id, edge_type')
        .eq('canvas_id', canvas_id)
        .order('created_at', { ascending: true }),
    ])

    if (nodesResult.error) {
      logger.error('[tool:get_big_picture] nodes query error', { canvas_id, error: nodesResult.error.message })
      throw new Error(`get_big_picture nodes failed: ${nodesResult.error.message}`)
    }
    if (edgesResult.error) {
      logger.error('[tool:get_big_picture] edges query error', { canvas_id, error: edgesResult.error.message })
      throw new Error(`get_big_picture edges failed: ${edgesResult.error.message}`)
    }

    // A set-aside node contributes nothing to the bird's-eye map, edges
    // touching it included (see CORE-CONCEPTS.md → set aside) — drop any
    // edge whose endpoint fell out of the active-node fetch above.
    const activeIds = new Set((nodesResult.data ?? []).map(n => n.id))
    const activeEdges = (edgesResult.data ?? []).filter(
      e => activeIds.has(e.from_node_id) && activeIds.has(e.to_node_id)
    )

    logger.info('[tool:get_big_picture] ok', {
      canvas_id,
      node_count: nodesResult.data?.length ?? 0,
      edge_count: activeEdges.length,
    })

    return {
      nodes: (nodesResult.data ?? []).map(n => ({
        node_id: n.id,
        summary: n.summary,
        direction_marker: n.direction_marker,
      })),
      edges: activeEdges.map(e => ({
        from: e.from_node_id,
        to: e.to_node_id,
        edge_type: e.edge_type,
      })),
    }
  },
})
