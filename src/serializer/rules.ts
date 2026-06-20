import type { AgentRole } from '../../types/index.js'

type CommonRuleFields = {
  includeRejectionInsights: boolean
  includeNorthStar: boolean
  includeClickMoment: boolean
}

type TieredRuleFields = {
  activeNode: 'full+attunement' | 'full' | 'summary'
  tier2: 'full' | 'full+contradictions' | 'summary' | 'full+both-trails' | 'na'
  tier3: 'summary+marker' | 'summary+flag' | 'summary' | 'na'
  tier4: 'trail+markers' | 'extract_contradictions' | 'trail' | 'na'
  includeAttunement: boolean
  includeGhostHistory: 'own' | 'none' | 'summary'
}

// Recency-tiered agents (everything except the Observer) — see serializeStateless/
// serializeTiered in index.ts, which take this narrowed type.
export type TieredSerializationRule = CommonRuleFields & TieredRuleFields & {
  threadType: 'canvas-stateful' | 'stateless'
}

// 'canvas-map' = bird's-eye agents (Observer). Bypasses recency tiers entirely —
// see serializeCanvasMap() in index.ts — so it carries none of TieredRuleFields.
export type CanvasMapRule = CommonRuleFields & {
  threadType: 'canvas-map'
}

export type SerializationRule = TieredSerializationRule | CanvasMapRule

// Transcribed directly from SERIALIZATION.md — Per-Agent Serialization Rules table.
export const SERIALIZATION_RULES: Record<AgentRole, SerializationRule> = {
  expander: {
    includeRejectionInsights: true,
    includeNorthStar: true,
    includeClickMoment: true,
    activeNode: 'full+attunement',
    tier2: 'full',
    tier3: 'summary+marker',
    tier4: 'trail+markers',
    includeAttunement: true,
    includeGhostHistory: 'own',
    threadType: 'canvas-stateful',
  },
  stress_tester: {
    includeRejectionInsights: true,
    includeNorthStar: true,
    includeClickMoment: true,
    activeNode: 'full',
    tier2: 'full+contradictions',
    tier3: 'summary+flag',
    tier4: 'extract_contradictions',
    includeAttunement: false,
    includeGhostHistory: 'none',
    threadType: 'canvas-stateful',
  },
  observer: {
    includeRejectionInsights: true,
    includeNorthStar: true,
    includeClickMoment: true,
    threadType: 'canvas-map',
  },
  articulator: {
    includeRejectionInsights: false,
    includeNorthStar: true,
    includeClickMoment: false,
    activeNode: 'full',
    tier2: 'full+both-trails',
    tier3: 'na',
    tier4: 'na',
    includeAttunement: false,
    includeGhostHistory: 'none',
    threadType: 'canvas-stateful',
  },
  outer_subconscious: {
    includeRejectionInsights: false,
    includeNorthStar: true,
    includeClickMoment: false,
    activeNode: 'full',
    tier2: 'na',
    tier3: 'na',
    tier4: 'na',
    includeAttunement: false,
    includeGhostHistory: 'none',
    threadType: 'stateless',
  },
}
