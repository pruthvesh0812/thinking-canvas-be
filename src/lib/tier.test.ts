import { describe, expect, it } from 'vitest'
import { getAvailableAgents } from './tier.js'

describe('getAvailableAgents', () => {
  it('returns every agent for every tier', () => {
    for (const tier of ['free', 'pro', 'power'] as const) {
      expect(getAvailableAgents(tier)).toEqual(['expander', 'stress_tester', 'observer', 'general'])
    }
  })
})
