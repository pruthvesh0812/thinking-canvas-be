import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import type { TemplateShape } from '../../types/index.js'

// System prompt is a constant — never interpolated from user data.
export const JEV_SYSTEM_PROMPT = `
You classify questions into canvas shapes. Return exactly one shape name.

Shapes:
- "hierarchy": the answer decomposes into parts, sub-ideas, pros/cons, or branching options. Use when the response is a claim with supporting points, a concept with sub-concepts, or a topic broken into facets.
- "sequence": the answer is an ordered process, timeline, flow, or step-by-step. Use when order matters and each step leads to the next.

Return JSON: { "shape": "hierarchy" | "sequence" }
No explanation. No content.
` as const

export const jevOutputSchema = z.object({
  shape: z.enum(['hierarchy', 'sequence']),
})

// Hierarchy is the more general shape: a sequence rendered as a hierarchy is
// usable, the reverse is not.
export const DEFAULT_SHAPE: TemplateShape = 'hierarchy'

export const jevAgent = new Agent({
  id: 'jev',
  name: 'Jev',
  model: models.fast(),
  instructions: async () => getPrompt('jev-system-prompt', JEV_SYSTEM_PROMPT),
})

// `input` is the pre-formatted user query (plus parent/sibling context on an
// expansion). Never throws — any failure resolves to the default shape.
export async function runJev(input: string): Promise<TemplateShape> {
  logger.info('[agent:jev] invoked')
  const started_at = Date.now()

  try {
    const { object } = await jevAgent.generate(input, {
      structuredOutput: { schema: jevOutputSchema },
      modelSettings: { maxOutputTokens: 32 },
    })

    logger.info('[agent:jev] done', { shape: object.shape, duration_ms: Date.now() - started_at })
    return object.shape
  } catch (err) {
    logger.warn('[agent:jev] failed — defaulting shape', {
      shape: DEFAULT_SHAPE,
      error: (err as Error).message,
      duration_ms: Date.now() - started_at,
    })
    return DEFAULT_SHAPE
  }
}
