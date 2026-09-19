import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { getEdgesByCanvas } from '../db/edges.js'
import { logger } from '../lib/logger.js'

export const get_branch = createTool({
  id: 'get_branch',
  description: 'Fetch all nodes reachable from a branch root following outgoing edges — gives Stress-Tester the full subtree to find weak assumptions.',
  inputSchema: z.object({
    branch_root_node_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    branch: z.array(z.object({
      node_id: z.string(),
      content: z.string().nullable(),
      summary: z.string().nullable(),
      direction_marker: z.string().nullable(),
    })),
  }),
  // canvas_id is server-injected via requestContext — see get_content.ts.
  requestContextSchema: z.object({
    canvas_id: z.string().uuid(),
  }),
  execute: async (inputData, { requestContext }) => {
    const { branch_root_node_id } = inputData
    const canvas_id = requestContext!.get('canvas_id') as string
    logger.info('[tool:get_branch] called', { canvas_id, branch_root_node_id })

    // Edges with BOTH endpoints active, excluded server-side in one round
    // trip. A set-aside node must not extend the subtree, nor be walked
    // through to reach a descendant beyond it (see CORE-CONCEPTS.md → set
    // aside) — dropping its edges here does both.
    let edges
    try {
      edges = await getEdgesByCanvas(canvas_id)
    } catch (err) {
      logger.error('[tool:get_branch] edge load error', { canvas_id, branch_root_node_id, error: (err as Error).message })
      throw err
    }

    const adjacency = new Map<string, string[]>()
    for (const e of edges) {
      if (!adjacency.has(e.from_node_id)) adjacency.set(e.from_node_id, [])
      adjacency.get(e.from_node_id)!.push(e.to_node_id)
    }

    const visited = new Set<string>()
    const stack = [branch_root_node_id]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const child of adjacency.get(current) ?? []) {
        stack.push(child)
      }
    }

    const node_ids = [...visited]
    if (node_ids.length === 0) {
      logger.warn('[tool:get_branch] no nodes reachable from root', { canvas_id, branch_root_node_id })
      return { branch: [] }
    }

    const { data: nodes, error: nodeErr } = await db
      .from('nodes')
      .select('id, content, summary, direction_marker')
      .eq('canvas_id', canvas_id)
      .in('id', node_ids)
      .is('set_aside_at', null)

    if (nodeErr) {
      logger.error('[tool:get_branch] node fetch error', { canvas_id, branch_root_node_id, error: nodeErr.message })
      throw new Error(`get_branch node fetch failed: ${nodeErr.message}`)
    }

    logger.info('[tool:get_branch] ok', { canvas_id, branch_root_node_id, branch_size: nodes?.length ?? 0 })

    return {
      branch: (nodes ?? []).map(n => ({
        node_id: n.id,
        content: n.content,
        summary: n.summary,
        direction_marker: n.direction_marker,
      })),
    }
  },
})
