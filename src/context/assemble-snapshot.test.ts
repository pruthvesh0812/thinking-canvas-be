import { describe, expect, it } from 'vitest'
import type { RetrievalResult } from '../../types/index.js'
import { assemblePrompt } from './assemble.js'

// Locks the exact prompt text for a full scenario (every layer present).
// If this fails after a refactor, the prompt the agent reads has changed.
describe('assemblePrompt snapshot', () => {
  const retrieval: RetrievalResult = {
    scope: 'S1',
    focus_node_ids: ['f'],
    nodes: [
      { id: 'f', seq: 2, tier: 'full', reason: 'focus', content: 'Usage-based billing', summary: 'Usage billing',
        notes: [{ id: 'a', content: 'Heavy users are 70% of revenue', created_at: '2026-01-01T00:00:01Z' }], note_count: 1 },
      { id: 'p', seq: 1, tier: 'title', reason: 'ancestor', content: 'Decide a pricing model', summary: 'Pricing decision', notes: [], note_count: 2 },
      { id: 'c', seq: 5, tier: 'full', reason: 'hop1', content: 'Set up Stripe <metering>', summary: null, notes: [], note_count: 0 },
    ],
    edges: [
      { id: 'e1', from_node_id: 'p', to_node_id: 'f', label: null, notes: [] },
      { id: 'e2', from_node_id: 'f', to_node_id: 'c', label: 'needs', notes: [{ id: 'n', content: 'Stripe only', created_at: '2026-01-01T00:00:02Z' }] },
    ],
    canvas_notes: [{ id: 'k', content: 'Launch in Q1', created_at: '2026-01-01T00:00:00Z' }],
  }

  it('full scenario prompt is unchanged', () => {
    const { prompt } = assemblePrompt({
      agent: 'expander',
      canvas: { title: 'B2B launch pricing', original_intent: 'Decide a pricing model' },
      retrieval,
      constraintsBlock: 'NEGATIVE CONSTRAINTS: no jargon',
      threadMemory: ['expander proposed "X" -> accepted'],
      task: { text: 'dig deeper', sourceType: 'context_entry' },
    })
    expect(prompt).toMatchInlineSnapshot(`
      "<canvas_intent>
      title: B2B launch pricing
      goal: Decide a pricing model
      notes about the whole canvas:
      <note>Launch in Q1</note>
      </canvas_intent>

      <negative_constraints>
      NEGATIVE CONSTRAINTS: no jargon
      </negative_constraints>

      <thread_memory>
      - expander proposed "X" -&gt; accepted
      </thread_memory>

      <focus>
      <node id="n2" reason="focus" tier="full">
      Usage-based billing
      <note>Heavy users are 70% of revenue</note>
      </node>
      </focus>

      <nodes>
      <node id="n1" reason="ancestor" tier="title" notes="2">Pricing decision</node>
      <node id="n5" reason="hop1" tier="full">
      Set up Stripe &lt;metering&gt;
      </node>
      </nodes>

      <edges>
      n1 --> n2
      <edge>
      n2 -"needs"-> n5
      <note>Stripe only</note>
      </edge>
      </edges>

      <task agent="expander" scope="S1">
      dig deeper
      </task>"
    `)
  })
})
