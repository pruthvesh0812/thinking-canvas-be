import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import { getNodesByIds } from '../db/nodes.js'
import type { AgentRole, AttunementState, SessionPhase } from '../../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// THE JUDGE — the repurposed Orchestrator (DESIGN.md §4b).
//
// One call over Attunement + the FULL canvas map (complete node content) →
// { mature, route, locus_node_ids, headroom, confidence }. Maturity is
// per-agent and locus-specific, never a global score: the judge must find
// EVIDENCE — a specific place where one agent's move lands a genuine,
// in-range augmentation. No agent passes → not mature → silent hold.
//
// The old rule-list router is retired: routing, maturity, and the tier
// upgrade-offer flag all live here now. question_style comes from Attunement
// via the serializer (the Orchestrator's copy was only ever logged).
// ─────────────────────────────────────────────────────────────────────────

// Judge candidates — the four agents with a locus-specific maturity rubric
// (DESIGN §4b table). The Observer is deliberately absent: it reverted to a
// content agent with its own trigger surface and is never a judge route.
const JUDGE_CANDIDATES = ['expander', 'stress_tester', 'outer_subconscious', 'articulator'] as const

export type JudgeRoute = (typeof JUDGE_CANDIDATES)[number]

// System prompt is a constant — never interpolated from user data.
// Tier is intentionally NOT in the prompt: the judge picks the genuine best
// agent regardless; tier enforcement is server-side in runJudge (never trust
// the model with substitution — a weaker substitute is actively wrong, §4b).
export const JUDGE_SYSTEM_PROMPT = `
You are the Judge for ThinkingCanvas — the maturity gate and router for AI
intervention. You decide whether the canvas, RIGHT NOW, contains a specific
place where one agent's move would land a genuine augmentation — and if so,
which single agent, and where.

You will be given:
- attunement: { cognitive_mode, question_style, phase_shift_suggested, confidence }
- phase: the session's current phase ("diverging" | "converging")
- trigger_node_id: the node whose activity invoked you
- A CANVAS MAP with every node's COMPLETE content and its edges. The
  preconditions below live in the exact wording of nodes — judge from the
  words on the canvas, never from your paraphrase of them.
- NEGATIVE CONSTRAINTS and OBSERVER CONNECTION FEEDBACK blocks, when present.

MATURITY IS PER-AGENT AND LOCUS-SPECIFIC — never a global score. For each
eligible agent ask: "is there a specific place where this agent's move lands
a genuine, in-range augmentation?" You must find EVIDENCE and name the exact
node IDs it lives at. If no agent passes, return mature: false.

ELIGIBILITY AND EVIDENCE:

expander — eligible only when phase is "diverging"
  Evidence: a trail with momentum AND open space 1-2 jumps ahead along it.
  Not mature when: the node is isolated (no trail), the direction is
  exhausted, or the area is already densely branched.

stress_tester — eligible only when phase is "converging"
  Evidence: a committed subtree with at least one attackable surface — a
  contradiction, a hidden assumption, a scope gap, or a dependency risk.
  Not mature when: nothing is committed yet (pure divergence), or there is
  no attackable surface.

outer_subconscious — any phase
  Evidence: a concept with a strong NON-OBVIOUS analog — cross-domain or
  intra-domain.
  Not mature when: the content is purely literal/local, with no associative
  lift available.

articulator — any phase
  Evidence: two existing nodes with a real but UNNAMED relationship — one
  you can read 2-3 different ways, with no question node between them.
  Not mature when: no such pair exists, or the link is already labeled.

CHOOSING — SINGLE BEST, NEVER A RANKED SET:
- Phase pre-selects between expander (diverging) and stress_tester (converging).
- outer_subconscious and articulator are phase-agnostic and outrank the
  phase agent ONLY on clearly stronger evidence.
- Return exactly one route, or mature: false. Never dilute help with a
  second-best suggestion.

DEDUP — respect every refusal:
- If a candidate move matches anything in NEGATIVE CONSTRAINTS, or repeats a
  connection listed in OBSERVER CONNECTION FEEDBACK, that move is off the
  table. If it was your best, look for the next genuinely mature move — or
  return mature: false.

RANGE: the move must land 1-2 jumps from existing nodes. This is a coarse
filter — the content agent enforces exact distance.

OUTPUT FIELDS:
- mature: whether ANY agent has a genuine move right now
- route: the single best agent, or null when not mature
- locus_node_ids: the EXACT node IDs (copied from the map) where the move
  lands — your evidence. Never invent an ID.
- headroom: one sentence naming what/where the augmentation is, or null
- confidence: 0-1, how clear the evidence is

When in doubt, hold — a silent no-pipeline beats a hollow offer. Output ONLY
the structured fields requested. Never explain your reasoning.
` as const

export const judgeOutputSchema = z.object({
  mature: z.boolean(),
  route: z.enum(JUDGE_CANDIDATES).nullable(),  // null when not mature
  locus_node_ids: z.array(z.string()).default([]),
  headroom: z.string().nullable(),             // what/where the augmentation is
  confidence: z.number().min(0).max(1),
})

export type JudgeOutput = z.infer<typeof judgeOutputSchema>

export type JudgeInput = {
  canvas_id: string
  session_id: string
  trigger_node_id: string
  phase: SessionPhase
  attunement: Pick<AttunementState, 'cognitive_mode' | 'question_style' | 'phase_shift_suggested' | 'confidence'>
  serialized_context: string   // serializeJudgeContext() — full-content map + full rejection set
  available_agents: AgentRole[]
}

// What the pipeline consumes. tier_locked is computed server-side, never by the
// model: the genuine best agent is outside the user's tier → emit an upgrade
// offer at show time (task-07) instead of substituting a weaker agent (§4b).
export type JudgeDecision = JudgeOutput & { tier_locked: boolean }

export const judgeAgent = new Agent({
  id: 'judge',
  name: 'Judge',
  model: models.fast(),
  instructions: async () => getPrompt('judge-system-prompt', JUDGE_SYSTEM_PROMPT),
})

const HOLD: Omit<JudgeDecision, 'confidence' | 'headroom'> = {
  mature: false,
  route: null,
  locus_node_ids: [],
  tier_locked: false,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Locus ids must be REAL nodes on THIS canvas — they become the offer's
// anchor_node_ids downstream (task-04), so an invented id would poison the
// spawn anchor. Non-UUID strings are dropped before the DB call (Postgres
// rejects them outright), unknown/off-canvas ids after it.
async function validateLocusIds(canvas_id: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  const shaped = unique.filter(id => UUID_RE.test(id))
  const nodes = shaped.length > 0 ? await getNodesByIds(shaped) : []
  const onCanvas = new Set(nodes.filter(n => n.canvas_id === canvas_id).map(n => n.id))
  const valid = shaped.filter(id => onCanvas.has(id))

  if (valid.length < unique.length) {
    logger.warn('[agent:judge] dropped invented/off-canvas locus ids', {
      canvas_id,
      dropped: unique.filter(id => !onCanvas.has(id)),
    })
  }
  return valid
}

// One call: maturity + single-best routing. serialized_context must come from
// serializeJudgeContext() — the judgment is the LLM's, over full node content.
// thinkingBudget: 8000 ('high') compensates for the Flash base model.
export async function runJudge(input: JudgeInput): Promise<JudgeDecision> {
  const { canvas_id, trigger_node_id, phase, available_agents } = input
  logger.info('[agent:judge] invoked', { canvas_id, trigger_node_id, phase, available_agents })
  const started_at = Date.now()

  const prompt = [
    JSON.stringify({ attunement: input.attunement, phase, trigger_node_id }),
    input.serialized_context,
  ].join('\n\n')

  try {
    const { object } = await judgeAgent.generate(prompt, {
      structuredOutput: { schema: judgeOutputSchema },
      providerOptions: { google: models.thinking('high') },
    })

    if (!object.mature || object.route === null) {
      logger.info('[agent:judge] not mature — hold', {
        canvas_id,
        trigger_node_id,
        confidence: object.confidence,
        duration_ms: Date.now() - started_at,
      })
      return { ...HOLD, headroom: object.headroom, confidence: object.confidence }
    }

    // Phase gate re-checked in code — the prompt encodes it, but eligibility is
    // never left to the model alone. A phase-violating route is an invalid
    // judgment: hold rather than generate out of phase.
    const phaseViolation =
      (object.route === 'expander' && phase !== 'diverging') ||
      (object.route === 'stress_tester' && phase !== 'converging')
    if (phaseViolation) {
      logger.warn('[agent:judge] phase-violating route — hold', { canvas_id, route: object.route, phase })
      return { ...HOLD, headroom: null, confidence: object.confidence }
    }

    const locus_node_ids = await validateLocusIds(canvas_id, object.locus_node_ids)

    // Tier enforcement is server-side and never substitutes (§4b): the genuine
    // best stays the route; the pipeline turns tier_locked into an upgrade
    // offer instead of generating.
    const tier_locked = !available_agents.includes(object.route)

    logger.info('[agent:judge] done', {
      canvas_id,
      trigger_node_id,
      route: object.route,
      tier_locked,
      locus_count: locus_node_ids.length,
      confidence: object.confidence,
      duration_ms: Date.now() - started_at,
    })
    return { ...object, locus_node_ids, tier_locked }
  } catch (err) {
    logger.error('[agent:judge] failed', {
      canvas_id,
      trigger_node_id,
      error: (err as Error).message,
      duration_ms: Date.now() - started_at,
    })
    throw err
  }
}
