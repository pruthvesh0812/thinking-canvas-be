import type { AgentRole } from '../../types/index.js'

export type SerializationRule = {
  includeRejectionInsights: boolean
  includeNorthStar: boolean
  includeClickMoment: boolean
  activeNode: 'full+attunement' | 'full' | 'summary'
  tier2: 'full' | 'full+contradictions' | 'summary' | 'full+both-trails' | 'na'
  tier3: 'summary+marker' | 'summary+flag' | 'summary' | 'na'
  tier4: 'trail+markers' | 'extract_contradictions' | 'trail' | 'na'
  includeAttunement: boolean
  includeGhostHistory: 'own' | 'none' | 'summary'
  threadType: 'canvas-stateful' | 'stateless'
}

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
    activeNode: 'summary',
    tier2: 'summary',
    tier3: 'summary',
    tier4: 'trail',
    includeAttunement: false,
    includeGhostHistory: 'summary',
    threadType: 'canvas-stateful',
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
    threadType: 'stateless',
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
