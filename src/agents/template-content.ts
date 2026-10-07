import { Agent } from '@mastra/core/agent'
import type { ZodType } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import {
  rawHierarchySchema,
  rawSequenceSchema,
  type RawHierarchy,
  type RawSequence,
} from '../lib/template-validation.js'
import type { TemplateShape } from '../../types/index.js'

// System prompts are constants — never interpolated from user data.
export const HIERARCHY_CONTENT_SYSTEM_PROMPT = `
You fill a hierarchy schema for a thinking canvas. The user asked a question; your job is to break the answer into a root claim and 2-4 children.

Rules:
- root.label: the core answer in max 8 words. Plain statement, no jargon.
- root.detail: one sentence expanding the label. Max 30 words. Shown only on click.
- Each child is one supporting point, example, or question that goes beyond the root.
- child.label: max 8 words. A plain statement, not a sentence fragment.
- child.kind: "idea" for a supporting point, "example" for a concrete instance, "question" for something that pushes the user's thinking further.
- child.link: max 4 words describing the relationship to the parent (because, but, for example, what if, however).
- child.detail: one sentence, max 30 words. The understanding layer — shown only on click.
- Include at least one "question" kind child when the root is a claim.
- 2-4 children, never more. Each must add something distinct.
- Do not repeat what's in sibling labels.
- Use plain words. Don't finish the user's thought; go 1-2 steps beyond it and stop.

Return valid JSON matching the schema. No preamble, no summary, no text outside the JSON.
` as const

export const SEQUENCE_CONTENT_SYSTEM_PROMPT = `
You fill a sequence schema for a thinking canvas. The user asked a question; your job is to lay out the answer as an ordered flow of 3-6 steps.

Rules:
- title: the name of this process/flow in max 8 words.
- title detail: one sentence of context, max 30 words. Shown on click.
- Each step is one stage in the process.
- step.label: max 8 words. What happens at this step. Plain, imperative or declarative.
- step.detail: one sentence, max 30 words. The explanation layer — shown on click.
- step.transition: max 5 words connecting this step to the next. Think of it as the edge label. Omit on the last step.
- 3-6 steps. Fewer than 3 is not a sequence; more than 6 won't fit the canvas cleanly.
- Every step must be necessary. Don't pad with setup/conclusion steps.
- Use plain words. Each step should be understandable from its label alone.

Return valid JSON matching the schema. No preamble, no summary, no text outside the JSON.
` as const

export const hierarchyContentAgent = new Agent({
  id: 'hierarchy-content',
  name: 'HierarchyContent',
  model: models.content(),
  instructions: async () =>
    getPrompt('hierarchy-content-system-prompt', HIERARCHY_CONTENT_SYSTEM_PROMPT),
})

export const sequenceContentAgent = new Agent({
  id: 'sequence-content',
  name: 'SequenceContent',
  model: models.content(),
  instructions: async () =>
    getPrompt('sequence-content-system-prompt', SEQUENCE_CONTENT_SYSTEM_PROMPT),
})

// Per-call output cap from the spec's token budget.
const MAX_OUTPUT_TOKENS = 500

async function generateStructured<T>(
  agent: Agent,
  schema: ZodType<T>,
  input: string
): Promise<T> {
  const { object } = await agent.generate(input, {
    structuredOutput: { schema },
    modelSettings: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  })
  return object
}

// `input` is the pre-formatted user query (plus parent/sibling context on an
// expansion). Throws on failure — the caller turns that into the error response.
// The agent only fills the schema it is handed; the shape is already chosen.
export function runTemplateContent(shape: 'hierarchy', input: string): Promise<RawHierarchy>
export function runTemplateContent(shape: 'sequence', input: string): Promise<RawSequence>
export async function runTemplateContent(
  shape: TemplateShape,
  input: string
): Promise<RawHierarchy | RawSequence> {
  const agentId = shape === 'hierarchy' ? 'hierarchy-content' : 'sequence-content'
  logger.info(`[agent:${agentId}] invoked`)
  const started_at = Date.now()

  try {
    const raw =
      shape === 'hierarchy'
        ? await generateStructured(hierarchyContentAgent, rawHierarchySchema, input)
        : await generateStructured(sequenceContentAgent, rawSequenceSchema, input)

    logger.info(`[agent:${agentId}] done`, { duration_ms: Date.now() - started_at })
    return raw
  } catch (err) {
    logger.error(`[agent:${agentId}] failed`, {
      error: (err as Error).message,
      duration_ms: Date.now() - started_at,
    })
    throw err
  }
}
