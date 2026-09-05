import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const traverse_trail = createTool({
  id: 'traverse_trail',
  description: 'Walk the edge trail forward or backward from a node, returning the ordered sequence of connected nodes.',
  inputSchema: z.object({
    start_node_id: z.string().uuid(),
    direction: z.enum(['forward', 'backward']),
    max_hops: z.number().int().min(1).max(20).default(10),
  }),
  outputSchema: z.object({
    trail: z.array(z.object({
      node_id: z.string(),
      summary: z.string().nullable(),
      direction_marker: z.string().nullable(),
      edge_type: z.string(),
    })),
  }),
  // canvas_id is server-injected via requestContext — see get_content.ts.
  requestContextSchema: z.object({
    canvas_id: z.string().uuid(),
  }),
  execute: async (inputData, { requestContext }) => {
    const { start_node_id, direction, max_hops } = inputData
    const canvas_id = requestContext!.get('canvas_id') as string
    logger.info('[tool:traverse_trail] called', { canvas_id, start_node_id, direction, max_hops })

    const trail: { node_id: string; summary: string | null; direction_marker: string | null; edge_type: string }[] = []
    let current_id = start_node_id
    const visited = new Set<string>()

    for (let hop = 0; hop < max_hops; hop++) {
      if (visited.has(current_id)) break
      visited.add(current_id)

      const edgeQuery = db
        .from('edges')
        .select('id, from_node_id, to_node_id, edge_type')
        .eq('canvas_id', canvas_id)

      const { data: edges, error: edgeErr } = direction === 'forward'
        ? await edgeQuery.eq('from_node_id', current_id)
        : await edgeQuery.eq('to_node_id', current_id)

      if (edgeErr) {
        logger.error('[tool:traverse_trail] edge query error', { canvas_id, current_id, hop, error: edgeErr.message })
        throw new Error(`traverse_trail edge query failed: ${edgeErr.message}`)
      }
      if (!edges || edges.length === 0) break

      const edge = edges[0]
      const next_id = direction === 'forward' ? edge.to_node_id : edge.from_node_id

      const { data: node, error: nodeErr } = await db
        .from('nodes')
        .select('id, summary, direction_marker')
        .eq('id', next_id)
        .eq('canvas_id', canvas_id)
        .single()

      if (nodeErr) {
        logger.error('[tool:traverse_trail] node query error', { canvas_id, next_id, hop, error: nodeErr.message })
        throw new Error(`traverse_trail node query failed: ${nodeErr.message}`)
      }

      trail.push({
        node_id: node.id,
        summary: node.summary,
        direction_marker: node.direction_marker,
        edge_type: edge.edge_type,
      })

      current_id = next_id
    }

    logger.info('[tool:traverse_trail] ok', { canvas_id, start_node_id, direction, hops: trail.length })
    return { trail }
  },
})
