// Context-engineering tunables — every number the context pipeline reads lives here.
// Defaults from spec file 13 §13.3, minus what the story removed (summary, Jev, traversal,
// node cap). See .ai/features/context-engineering/story.md. Constants only, no behaviour.

import type { ContextScope } from '../../types/index.js'

// Retrieval scopes (D8): S1 = focus node(s) only, S2 = focus + neighbours + semantic hits,
// S3 = whole canvas. 'classify' = General agent picks one at run time via classify().

// Agents in the new roster. 'general' is not yet in AgentRole (types/index.ts) — added with Slice 1+.
export type ContextAgent = 'expander' | 'stress_tester' | 'observer' | 'general'

// Token budgets that pick the canvas size category.
export const SMALL_MAX_TOKENS = 15_000
export const MEDIUM_MAX_TOKENS = 50_000
// Fraction a canvas must move past a boundary before the category flips.
export const CATEGORY_HYSTERESIS = 0.1

// Neighbour full-text budget for hub nodes.
export const HUB_FULLTEXT_NEIGHBORS = 25

// expand_context tool limits per run.
export const EXPAND_CONTEXT_MAX_CALLS = 2
export const EXPAND_CONTEXT_MAX_IDS = 5

// Semantic retrieval: top-k and minimum cosine similarity.
export const S2_SEMANTIC_K = 5
export const S3_SEMANTIC_K = 8
export const SIM_FLOOR_S2 = 0.75
export const SIM_FLOOR_S3 = 0.65

// Most-recent nodes always included.
export const RECENT_N = 10

// Thread memory (D9): last N turns across the canvas's agent threads.
export const THREAD_MEMORY_TURNS = 5

// Minimum classify() confidence to trust its scope (spec files 05, 10).
export const SCOPE_CONFIDENCE_MIN = 0.7

// D8: scope by agent. General decides via classify().
export const AGENT_SCOPE: Record<ContextAgent, ContextScope | 'classify'> = {
  expander: 'S1',
  stress_tester: 'S2',
  observer: 'S3',
  general: 'classify',
}
