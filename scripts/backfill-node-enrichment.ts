import { generateObject } from 'ai'
import { z } from 'zod'
import { db } from '../src/db/client.js'
import { models, generateEmbedding } from '../src/lib/llm.js'
import { updateSummary, updateEmbedding } from '../src/db/nodes.js'
import { logger } from '../src/lib/logger.js'

// ─────────────────────────────────────────────────────────────────────────
// One-off backfill: regenerate summary + direction_marker (and embedding)
// for every node whose enrichment never landed.
//
// Context: enrichNode() used to bundle the summary and embedding writes into
// a single Promise.all. When the embedding model was retired upstream and
// began returning 404, that rejection took the summary write down with it,
// so every node ever created was left with a null summary — which blanks out
// every edge line in every agent's serialized context. The pipeline bug is
// fixed in src/routes/canvas-event.ts; this repairs the rows it already
// damaged.
//
// Safe to re-run: both writes are overwrites, and rows that already have a
// summary are skipped unless --all is passed.
//
//   npx tsx --env-file=.env scripts/backfill-node-enrichment.ts [--all] [--dry]
// ─────────────────────────────────────────────────────────────────────────

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

async function main() {
  const all = process.argv.includes('--all')
  const dry = process.argv.includes('--dry')

  let query = db.from('nodes').select('id, content, summary, canvas_id').order('created_at', { ascending: true })
  if (!all) query = query.is('summary', null)

  const { data: nodes, error } = await query
  if (error) throw new Error(`backfill: node fetch failed: ${error.message}`)

  logger.info('[backfill] start', { total: nodes?.length ?? 0, mode: all ? 'all' : 'null-summary-only', dry })
  if (dry) {
    for (const n of nodes ?? []) {
      console.log(`  ${n.id.slice(0, 8)}  "${(n.content ?? '').slice(0, 70)}"`)
    }
    logger.info('[backfill] dry run — nothing written')
    return
  }

  let summaries = 0
  let embeddings = 0
  const failures: Array<{ node_id: string; error: string }> = []

  // Sequential on purpose: this is a one-off repair against a rate-limited
  // model, and finishing slowly beats tripping a 429 halfway through.
  for (const node of nodes ?? []) {
    try {
      const { object } = await generateObject({
        model: models.fast(),
        schema: directionalSummarySchema,
        system: DIRECTIONAL_SUMMARY_PROMPT,
        prompt: node.content ?? '',
        providerOptions: { google: models.thinking('low') },
      })
      await updateSummary(node.id, object.summary, object.direction_marker)
      summaries++
      logger.info('[backfill] summary written', {
        node_id: node.id,
        direction_marker: object.direction_marker,
        summary: object.summary,
      })

      // Same split as the fixed enrichNode: an embedding failure must never
      // roll back a summary that already landed.
      try {
        const embedding = await generateEmbedding(node.content || object.summary)
        await updateEmbedding(node.id, embedding)
        embeddings++
      } catch (err) {
        logger.error('[backfill] embedding failed — summary kept', {
          node_id: node.id,
          error: (err as Error).message,
        })
      }
    } catch (err) {
      failures.push({ node_id: node.id, error: (err as Error).message })
      logger.error('[backfill] summary failed', { node_id: node.id, error: (err as Error).message })
    }
  }

  logger.info('[backfill] done', {
    total: nodes?.length ?? 0,
    summaries,
    embeddings,
    failed: failures.length,
  })
  if (failures.length > 0) process.exitCode = 1
}

main().catch(err => {
  logger.error('[backfill] fatal', { error: (err as Error).message })
  process.exit(1)
})
