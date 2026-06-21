import type { AgentRole, SubscriptionTier } from '../../types/index.js'

// Tier → available content agents (server-side enforcement only — never trust client claims).
//   Free:  Expander + Articulator only
//   Pro:   all 5 content agents (+ Rejection Insights + Session Complete pipelines, which gate on tier elsewhere)
//   Power: all Pro + cognitive profile (v1.5, not yet implemented — same content agents for now)
const FREE_AGENTS: AgentRole[] = ['expander', 'articulator']

const ALL_AGENTS: AgentRole[] = [
  'expander',
  'stress_tester',
  'observer',
  'outer_subconscious',
  'articulator',
]

export function getAvailableAgents(tier: SubscriptionTier): AgentRole[] {
  switch (tier) {
    case 'free':
      return [...FREE_AGENTS]
    case 'pro':
    case 'power':
      return [...ALL_AGENTS]
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}
