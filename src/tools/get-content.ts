import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const get_content = createTool({
  id: 'get_content',
  description: 'Fetch the full content, summary, and direction marker of a single node by node_id.',
  inputSchema: z.object({
    canvas_id: z.string().uuid(),
    node_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    node_id: z.string(),
    content: z.string().nullable(),
    summary: z.string().nullable(),
    direction_marker: z.string().nullable(),
    session_id: z.string(),
    created_at: z.string(),
  }),
  execute: async ({ context }) => {
    const { canvas_id, node_id } = context
    logger.info('[tool:get_content] called', { canvas_id, node_id })

    const { data, error } = await db
      .from('nodes')
      .select('id, content, summary, direction_marker, session_id, created_at')
      .eq('id', node_id)
      .eq('canvas_id', canvas_id)
      .single()

    if (error) {
      logger.error('[tool:get_content] db error', { canvas_id, node_id, error: error.message })
      throw new Error(`get_content failed: ${error.message}`)
    }

    logger.info('[tool:get_content] ok', { node_id, has_content: !!data.content, has_summary: !!data.summary })

    return {
      node_id: data.id,
      content: data.content,
      summary: data.summary,
      direction_marker: data.direction_marker,
      session_id: data.session_id,
      created_at: data.created_at,
    }
  },
})
