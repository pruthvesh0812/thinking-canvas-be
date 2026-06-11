import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_path = createTool({
  id: 'get_path',
  description: 'Find the shortest path between two nodes via BFS over the edge graph — used by Articulator to understand what connects two ideas.',
  inputSchema: z.object({
    canvas_id: z.string().uuid(),
    from_node_id: z.string().uuid(),
    to_node_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    path: z.array(z.object({
      node_id: z.string(),
      summary: z.string().nullable(),
      edge_type: z.string().nullable(),
    })),
    length: z.number(),
  }),
  execute: async ({ context }) => {
    const { canvas_id, from_node_id, to_node_id } = context
    logger.info('[tool:get_path] called', { canvas_id, from_node_id, to_node_id })

    const { data: edges, error } = await db
      .from('edges')
      .select('from_node_id, to_node_id, edge_type')
      .eq('canvas_id', canvas_id)

    if (error) {
      logger.error('[tool:get_path] edge load error', { canvas_id, error: error.message })
      throw new Error(`get_path edge load failed: ${error.message}`)
    }

    const adjacency = new Map<string, { to: string; edge_type: string }[]>()
    for (const e of edges ?? []) {
      if (!adjacency.has(e.from_node_id)) adjacency.set(e.from_node_id, [])
      adjacency.get(e.from_node_id)!.push({ to: e.to_node_id, edge_type: e.edge_type })
    }

    const queue: { node_id: string; path: { node_id: string; edge_type: string | null }[] }[] = [
      { node_id: from_node_id, path: [{ node_id: from_node_id, edge_type: null }] },
    ]
    const visited = new Set<string>([from_node_id])

    while (queue.length > 0) {
      const current = queue.shift()!

      if (current.node_id === to_node_id) {
        const node_ids = current.path.map(p => p.node_id)
        const { data: nodes } = await db
          .from('nodes')
          .select('id, summary')
          .eq('canvas_id', canvas_id)
          .in('id', node_ids)

        const summaryMap = new Map((nodes ?? []).map(n => [n.id, n.summary]))
        const pathLength = current.path.length - 1

        logger.info('[tool:get_path] path found', { canvas_id, from_node_id, to_node_id, length: pathLength })

        return {
          path: current.path.map(p => ({
            node_id: p.node_id,
            summary: summaryMap.get(p.node_id) ?? null,
            edge_type: p.edge_type,
          })),
          length: pathLength,
        }
      }

      for (const neighbor of adjacency.get(current.node_id) ?? []) {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to)
          queue.push({
            node_id: neighbor.to,
            path: [...current.path, { node_id: neighbor.to, edge_type: neighbor.edge_type }],
          })
        }
      }
    }

    logger.warn('[tool:get_path] no path found', { canvas_id, from_node_id, to_node_id })
    return { path: [], length: 0 }
  },
})
