import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_big_picture = createTool({
  id: 'get_big_picture',
  description: 'Fetch all node summaries and the full edge map for a canvas — bird\'s eye view for the Observer.',
  inputSchema: z.object({
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
  execute: async ({ context }) => {
    const { canvas_id } = context
    logger.info('[tool:get_big_picture] called', { canvas_id })

    const [nodesResult, edgesResult] = await Promise.all([
      db
        .from('nodes')
        .select('id, summary, direction_marker')
        .eq('canvas_id', canvas_id)
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

    logger.info('[tool:get_big_picture] ok', {
      canvas_id,
      node_count: nodesResult.data?.length ?? 0,
      edge_count: edgesResult.data?.length ?? 0,
    })

    return {
      nodes: (nodesResult.data ?? []).map(n => ({
        node_id: n.id,
        summary: n.summary,
        direction_marker: n.direction_marker,
      })),
      edges: (edgesResult.data ?? []).map(e => ({
        from: e.from_node_id,
        to: e.to_node_id,
        edge_type: e.edge_type,
      })),
    }
  },
})
