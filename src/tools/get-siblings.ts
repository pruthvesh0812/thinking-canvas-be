import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_siblings = createTool({
  id: 'get_siblings',
  description: 'Fetch sibling nodes that share the same parent as the given node — nodes the Observer uses to detect divergence.',
  inputSchema: z.object({
    canvas_id: z.string().uuid(),
    node_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    siblings: z.array(z.object({
      node_id: z.string(),
      summary: z.string().nullable(),
      direction_marker: z.string().nullable(),
    })),
  }),
  execute: async ({ context }) => {
    const { canvas_id, node_id } = context
    logger.info('[tool:get_siblings] called', { canvas_id, node_id })

    const { data: parentEdges, error: parentErr } = await db
      .from('edges')
      .select('from_node_id')
      .eq('canvas_id', canvas_id)
      .eq('to_node_id', node_id)

    if (parentErr) {
      logger.error('[tool:get_siblings] parent lookup error', { canvas_id, node_id, error: parentErr.message })
      throw new Error(`get_siblings parent lookup failed: ${parentErr.message}`)
    }
    if (!parentEdges || parentEdges.length === 0) {
      logger.info('[tool:get_siblings] no parent found, returning empty', { canvas_id, node_id })
      return { siblings: [] }
    }

    const parent_ids = parentEdges.map(e => e.from_node_id)

    const { data: siblingEdges, error: siblingErr } = await db
      .from('edges')
      .select('to_node_id')
      .eq('canvas_id', canvas_id)
      .in('from_node_id', parent_ids)
      .neq('to_node_id', node_id)

    if (siblingErr) {
      logger.error('[tool:get_siblings] sibling edges error', { canvas_id, node_id, error: siblingErr.message })
      throw new Error(`get_siblings children lookup failed: ${siblingErr.message}`)
    }
    if (!siblingEdges || siblingEdges.length === 0) {
      logger.info('[tool:get_siblings] no siblings found', { canvas_id, node_id })
      return { siblings: [] }
    }

    const sibling_ids = [...new Set(siblingEdges.map(e => e.to_node_id))]

    const { data: nodes, error: nodesErr } = await db
      .from('nodes')
      .select('id, summary, direction_marker')
      .eq('canvas_id', canvas_id)
      .in('id', sibling_ids)

    if (nodesErr) {
      logger.error('[tool:get_siblings] node fetch error', { canvas_id, node_id, error: nodesErr.message })
      throw new Error(`get_siblings node fetch failed: ${nodesErr.message}`)
    }

    logger.info('[tool:get_siblings] ok', { canvas_id, node_id, sibling_count: nodes?.length ?? 0 })

    return {
      siblings: (nodes ?? []).map(n => ({
        node_id: n.id,
        summary: n.summary,
        direction_marker: n.direction_marker,
      })),
    }
  },
})
