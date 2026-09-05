import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_window = createTool({
  id: 'get_window',
  description: 'Fetch the N most recent nodes on a canvas across all sessions — sliding context window.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(10),
  }),
  outputSchema: z.object({
    nodes: z.array(z.object({
      node_id: z.string(),
      content: z.string().nullable(),
      summary: z.string().nullable(),
      direction_marker: z.string().nullable(),
      session_id: z.string(),
      created_at: z.string(),
    })),
  }),
  // canvas_id is server-injected via requestContext — see get_content.ts.
  requestContextSchema: z.object({
    canvas_id: z.string().uuid(),
  }),
  execute: async (inputData, { requestContext }) => {
    const { limit } = inputData
    const canvas_id = requestContext!.get('canvas_id') as string
    logger.info('[tool:get_window] called', { canvas_id, limit })

    const { data, error } = await db
      .from('nodes')
      .select('id, content, summary, direction_marker, session_id, created_at')
      .eq('canvas_id', canvas_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('[tool:get_window] db error', { canvas_id, error: error.message })
      throw new Error(`get_window failed: ${error.message}`)
    }

    logger.info('[tool:get_window] ok', { canvas_id, returned: data?.length ?? 0 })

    return {
      nodes: (data ?? []).map(n => ({
        node_id: n.id,
        content: n.content,
        summary: n.summary,
        direction_marker: n.direction_marker,
        session_id: n.session_id,
        created_at: n.created_at,
      })),
    }
  },
})
