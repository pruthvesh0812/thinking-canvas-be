import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { models } from '../lib/llm.js'
import { createInsight } from '../db/rejection-insights.js'
import { getByCanvas, updateActiveInsights } from '../db/threads.js'
import type { AgentRole, RejectionReason } from '../../types/index.js'

// How many turns a temporal_deferral stays active before it expires.
const TEMPORAL_DEFERRAL_TURNS = 3

// System prompt is a constant — never interpolated from user data.
const REJECTION_CLASSIFIER_SYSTEM_PROMPT = `
You classify why a user rejected an AI ghost suggestion on ThinkingCanvas, so
future agent turns can avoid the same mistake. You will be given the rejected
ghost content and the user's stated rejection reason.

Choose a severity:
- "hard_block"        — the suggestion was fundamentally wrong; never repeat this approach
- "approach_pivot"    — the underlying insight may be salvageable, but the framing must change
- "temporal_deferral" — the suggestion was fine but ill-timed; pause it for a few turns

Produce 1-3 insight_points — short, actionable rules a future agent can follow
(e.g. "Avoid high-level analogies"). Each point gets a sequence_number; use 0
when you cannot infer a specific turn.

Output ONLY the structured fields requested. Never explain your reasoning.
` as const

const rejectionInsightSchema = z.object({
  severity: z.enum(['hard_block', 'approach_pivot', 'temporal_deferral']),
  insight_points: z
    .array(
      z.object({
        label: z.string(),
        sequence_number: z.number().int(),
      })
    )
    .min(1)
    .max(3),
})

const rejectionClassifierAgent = new Agent({
  id: 'rejection-classifier',
  name: 'Rejection Classifier',
  model: models.fast(),
  instructions: REJECTION_CLASSIFIER_SYSTEM_PROMPT,
})

// Immediate pipeline (no debounce) — fires when a user rejects a ghost. Turns
// the rejection into an active negative constraint for future agent turns.
export const rejectionInsightsPipeline = inngest.createFunction(
  {
    id: 'rejection-insights',
    triggers: [{ event: 'canvas/ghost.rejected' }],
  },
  async ({ event, step }) => {
    const {
      canvas_id,
      session_id,
      thread_id,
      agent_role,
      rejected_ghost_content,
      rejection_reason,
    } = event.data as {
      canvas_id: string
      session_id: string
      thread_id: string
      agent_role: AgentRole
      rejected_ghost_content: string
      rejection_reason: RejectionReason
    }
    logger.info('[pipeline:rejection-insights] start', { canvas_id, thread_id, rejection_reason })

    // ── Step 1: Classify the rejection (gemini-2.5-flash, thinking:low) ────
    const insight = await step.run('classify', async () => {
      const prompt = JSON.stringify({
        rejected_ghost_content,
        rejection_reason,
      })
      const { object } = await rejectionClassifierAgent.generate(prompt, {
        structuredOutput: { schema: rejectionInsightSchema },
        providerOptions: { google: models.thinking('low') },
      })
      return object
    })

    // ── Step 2: Save to rejection_insights (content-category row) ──────────
    const savedInsight = await step.run('save-insight', async () =>
      createInsight({
        canvas_id,
        session_id,
        thread_id,
        rejection_reason,
        severity: insight.severity,
        insight_points: insight.insight_points,
        turns_remaining: insight.severity === 'temporal_deferral' ? TEMPORAL_DEFERRAL_TURNS : null,
        active: true,
        target_edge_id: null,
        connection_feedback: null,
      })
    )

    // ── Step 3: Append the insight id to the thread's active list ───────────
    await step.run('update-thread', async () => {
      const thread = await getByCanvas(canvas_id, agent_role)
      if (!thread) {
        logger.warn('[pipeline:rejection-insights] no thread to update', { canvas_id, agent_role })
        return
      }
      const updated = [...(thread.active_rejection_insight_ids ?? []), savedInsight.id]
      await updateActiveInsights(thread.id, updated)
    })

    logger.info('[pipeline:rejection-insights] done', {
      canvas_id,
      insight_id: savedInsight.id,
      severity: savedInsight.severity,
    })
  }
)
