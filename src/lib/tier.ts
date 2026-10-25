import type { AgentRole, SubscriptionTier } from '../../types/index.js'

// Every agent is available on every tier for now (paid-tier differences are a later
// discussion). Server-side enforcement only — never trust client claims.
const ALL_AGENTS: AgentRole[] = ['expander', 'stress_tester', 'observer', 'general']

export function getAvailableAgents(_tier: SubscriptionTier): AgentRole[] {
  return [...ALL_AGENTS]
}
