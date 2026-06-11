import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { generateEmbedding } from '../lib/llm.js'
import { db } from '../db/client.js'
import { logger } from '../lib/logger.js'

export const semantic_promote = createTool({
  id: 'semantic_promote',
  description: 'Find canvas nodes semantically similar to a query using pgvector cosine search — promotes Tier 3/4 nodes into full context without bloating the thread.',
  inputSchema: z.object({
    canvas_id: z.string().uuid(),
    query_text: z.string().min(1),
    exclude_node_ids: z.array(z.string().uuid()).default([]),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  outputSchema: z.object({
    promoted: z.array(z.object({
      node_id: z.string(),
      content: z.string().nullable(),
      similarity: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const { canvas_id, query_text, exclude_node_ids, limit } = context
    logger.info('[tool:semantic_promote] called', {
      canvas_id,
      query_preview: query_text.slice(0, 60),
      exclude_count: exclude_node_ids.length,
      limit,
    })

    logger.info('[tool:semantic_promote] generating embedding', { canvas_id })
    const embedding = await generateEmbedding(query_text)
    logger.info('[tool:semantic_promote] embedding generated', { canvas_id, dims: embedding.length })

    const { data, error } = await db.rpc('match_nodes', {
      query_embedding: embedding,
      canvas_id_filter: canvas_id,
      match_threshold: 0.75,
      match_count: limit + exclude_node_ids.length,
    })

    if (error) {
      logger.error('[tool:semantic_promote] match_nodes rpc error', { canvas_id, error: error.message })
      throw new Error(`semantic_promote match_nodes failed: ${error.message}`)
    }

    const promoted = (data ?? [])
      .filter((row: { id: string }) => !exclude_node_ids.includes(row.id))
      .slice(0, limit)
      .map((row: { id: string; content: string | null; similarity: number }) => ({
        node_id: row.id,
        content: row.content,
        similarity: row.similarity,
      }))

    logger.info('[tool:semantic_promote] ok', {
      canvas_id,
      raw_matches: data?.length ?? 0,
      after_exclusion: promoted.length,
    })

    return { promoted }
  },
})
